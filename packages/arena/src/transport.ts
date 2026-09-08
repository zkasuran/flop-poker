// SPDX-License-Identifier: Apache-2.0
//
// technocore.chat transport. Every operation is one plain GET, so this is a thin fetch
// wrapper: read a room, long-poll it, export it, read/write a note, and append a signed
// frame through the say-signed lane. It holds no game state — the room and its notes are
// the state, and this client is one of many peers. The base URL is configurable, so any
// self-hosted technocore works identically.

import { signingMessage } from "./frames.js";
import type { Identity } from "./identity.js";
import { verify } from "./identity.js";

export const DEFAULT_BASE_URL = "https://technocore.chat";

/** One stored room record, as returned by `?format=json` and `/export`. */
export interface Record {
  seq: number;
  /** ISO-8601 timestamp assigned by the venue. */
  ts: string;
  from: string;
  text: string;
  /** the transport nonce, kept as a string so 19-digit values stay exact. */
  nonce: string;
  sig?: string;
}

export interface RoomPage {
  room: string;
  firstSeq: number;
  lastSeq: number;
  generation: number;
  messages: Record[];
}

export class TransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

export interface ReadOptions {
  since?: number;
  limit?: number;
  /** long-poll seconds (0..10); only meaningful together with `since`. */
  wait?: number;
  /** re-poll counter to defeat a harness response cache on an idle room. */
  n?: number;
}

export interface WriteResult {
  ok: boolean;
  status: number;
  body: string;
}

const enc = encodeURIComponent;

export interface TechnocoreOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class Technocore {
  readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  private readonly lastNonce = new Map<string, bigint>();

  constructor(opts: TechnocoreOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.doFetch = opts.fetch ?? globalThis.fetch;
    if (!this.doFetch) throw new Error("arena: no fetch available; pass one in options");
  }

  /** A transport nonce that strictly increases per room, for the signed lane. */
  nextNonce(room: string): string {
    let n = BigInt(Date.now());
    const last = this.lastNonce.get(room);
    if (last !== undefined && n <= last) n = last + 1n;
    this.lastNonce.set(room, n);
    return n.toString();
  }

  /** Read a room as JSON. Throws TransportError on a non-2xx (a 429 body says how long to wait). */
  async read(room: string, opts: ReadOptions = {}): Promise<RoomPage> {
    const q = new URLSearchParams({ format: "json" });
    if (opts.since !== undefined) q.set("since", String(opts.since));
    if (opts.limit !== undefined) q.set("limit", String(opts.limit));
    if (opts.wait !== undefined) q.set("wait", String(opts.wait));
    if (opts.n !== undefined) q.set("n", String(opts.n));
    const res = await this.doFetch(`${this.baseUrl}/r/${enc(room)}?${q}`);
    const body = await res.text();
    if (!res.ok) throw new TransportError(`read ${room} failed`, res.status, body);
    const j = JSON.parse(body) as {
      room: string;
      first_seq: number;
      last_seq: number;
      generation: number;
      messages: Array<{ seq: number; ts: string; from: string; text: string; nonce: number | string; sig?: string }>;
    };
    return {
      room: j.room,
      firstSeq: j.first_seq,
      lastSeq: j.last_seq,
      generation: j.generation,
      messages: j.messages.map((m) => ({ ...m, nonce: String(m.nonce) })),
    };
  }

  /**
   * The retained ring as raw JSONL, snapshotted at open, so signed records re-verify
   * from the dump alone. Nonce is pulled from the raw bytes with a regex rather than
   * JSON.parse, because a 19-digit nonce would lose precision as a JS number and then
   * fail a good signature.
   */
  async exportRoom(room: string): Promise<Record[]> {
    const res = await this.doFetch(`${this.baseUrl}/r/${enc(room)}/export`);
    const body = await res.text();
    if (!res.ok) throw new TransportError(`export ${room} failed`, res.status, body);
    const out: Record[] = [];
    for (const line of body.split("\n")) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as Omit<Record, "nonce"> & { nonce: number };
      const m = /"nonce":(\d+)/.exec(line);
      out.push({ ...parsed, nonce: m ? m[1]! : String(parsed.nonce) });
    }
    return out;
  }

  /** Append a signed frame. Signs `<room>|<nonce>|<text>` and writes the say-signed GET. */
  async saySigned(room: string, identity: Identity, frameText: string, nonce?: string): Promise<WriteResult> {
    const use = nonce ?? this.nextNonce(room);
    const sig = identity.sign(signingMessage(room, use, frameText));
    const url = `${this.baseUrl}/r/${enc(room)}/say-signed/${enc(identity.did)}/${sig}/${use}/${enc(frameText)}`;
    const res = await this.doFetch(url);
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  }

  /** Read a note value, or null if it does not exist. */
  async getNote(ns: string, key: string): Promise<string | null> {
    const res = await this.doFetch(`${this.baseUrl}/kv/${enc(ns)}/${enc(key)}`);
    const body = await res.text();
    if (res.status === 404) return null;
    if (!res.ok) throw new TransportError(`getNote ${ns}/${key} failed`, res.status, body);
    return body;
  }

  /** List the keys in a namespace (never lists `p-` keys). */
  async listNote(ns: string): Promise<string> {
    const res = await this.doFetch(`${this.baseUrl}/kv/${enc(ns)}`);
    const body = await res.text();
    if (!res.ok) throw new TransportError(`listNote ${ns} failed`, res.status, body);
    return body;
  }

  /**
   * Write a note. `if`/`ifAbsent` are the venue's compare-and-set: a 409 carries the
   * current value, returned as `current` so a lost CAS is legible rather than an error.
   */
  async setNote(
    ns: string,
    key: string,
    value: string,
    opts: { if?: string; ifAbsent?: boolean } = {},
  ): Promise<{ ok: boolean; status: number; current?: string }> {
    const q = new URLSearchParams();
    if (opts.if !== undefined) q.set("if", opts.if);
    if (opts.ifAbsent) q.set("if_absent", "1");
    const qs = q.toString();
    const url = `${this.baseUrl}/kv/${enc(ns)}/${enc(key)}/set/${enc(value)}${qs ? "?" + qs : ""}`;
    const res = await this.doFetch(url);
    const body = await res.text();
    if (res.status === 409) return { ok: false, status: 409, current: body };
    return { ok: res.ok, status: res.status };
  }
}

/** Verify one stored record's signature against its own `from` did:key. */
export function verifyRecord(room: string, rec: Record): boolean {
  if (!rec.sig) return false;
  try {
    verify(rec.from, rec.sig, signingMessage(room, rec.nonce, rec.text));
    return true;
  } catch {
    return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
