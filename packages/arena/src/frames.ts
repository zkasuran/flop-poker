// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// arena/1 wire frames. One frame per technocore room message: the prefix `arena1 `
// followed by one canonical, ASCII-only JSON object on a single line.
//
// Canonical = keys sorted, compact separators, undefined dropped, every non-ASCII code
// unit `\uXXXX`-escaped. The escape matters: technocore stores code points verbatim and
// never normalizes, and it sweeps controls/format characters to spaces, so ASCII-only
// text is the only text whose stored bytes equal the bytes a did:key signature covered.
// Decoding is fail-closed: an unknown type, a missing field or a malformed value returns
// null, never a coerced frame — every byte in a room is anonymous input.

import { isDid } from "./identity.js";
import { bytesToHex, randomBytes, sha256Hex } from "./bytes.js";
import type { Gate } from "./gate.js";

export const ARENA_VERSION = "arena/1" as const;
export const ARENA_PREFIX = "arena1 " as const;
export const ARENA_DOMAIN = "FLOP::arena::v1" as const;
/** technocore's single-line message cap. Larger payloads ride the blob layer. */
export const MAX_FRAME_CHARS = 4096;

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface OpenFrame {
  type: "open";
  /** did:key of the opener. */
  from: string;
  /** format id, e.g. "rps", "poker-holdem". */
  format: string;
  /** format-specific config (bestOf, blinds, ...). Opaque here. */
  params: Json;
  gate: Gate;
  seats: { min: number; max: number };
  /** optional join deadline, unix ms. */
  deadlineMs?: number;
  /** random hex: makes the id unique and defeats the venue duplicate-text filter. */
  nonce: string;
  /** 0x + sha256 over the domain-tagged canonical open fields (see tableIdOf). */
  id: string;
}

export interface JoinFrame {
  type: "join";
  from: string;
  table: string;
  seat?: number;
  /** gate-specific proof: a passcode preimage, a stake contract id, etc. */
  proof?: string;
  nonce: string;
}

export interface StartFrame {
  type: "start";
  from: string;
  table: string;
  /** seat order as did:keys, sealed once (derived from a commit-reveal seed). */
  order: string[];
  params?: Json;
  nonce: string;
}

export interface ActFrame {
  type: "act";
  from: string;
  table: string;
  /** hand/match index within a reused table. */
  hand?: number;
  /** format-defined step name, e.g. "commit", "reveal", "shuffle", "bet". */
  step: string;
  /** small inline payload. */
  data?: Json;
  /** 0x + sha256 of a note blob when the payload is larger than a message. */
  blob?: string;
  nonce: string;
}

export interface ResultFrame {
  type: "result";
  from: string;
  table: string;
  hand?: number;
  /** the computed, re-derivable outcome. Verified on recompute, never trusted. */
  outcome: Json;
  nonce: string;
}

export interface BeatFrame {
  type: "beat";
  from: string;
  table: string;
  note?: string;
  nonce: string;
}

export interface AbortFrame {
  type: "abort";
  from: string;
  table: string;
  reason?: string;
  nonce: string;
}

export type ArenaFrame =
  | OpenFrame
  | JoinFrame
  | StartFrame
  | ActFrame
  | ResultFrame
  | BeatFrame
  | AbortFrame;

export type ArenaFrameType = ArenaFrame["type"];

// ── canonical serialization ──────────────────────────────────────────────────

function stable(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value)) throw new Error("arena: non-finite number is not serializable");
    return JSON.stringify(value);
  }
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => stable(v === undefined ? null : v)).join(",") + "]";
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stable(obj[k])).join(",") + "}";
  }
  throw new Error(`arena: ${t} is not serializable`);
}

function asciiEscape(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    out += c > 0x7f ? "\\u" + c.toString(16).padStart(4, "0") : s[i];
  }
  return out;
}

/** The canonical, ASCII-only JSON string for any JSON value. */
export function canonicalJson(value: unknown): string {
  return asciiEscape(stable(value));
}

// ── ids and signing ────────────────────────────────────────────────────────

/** The table id: 0x + sha256 over the domain-tagged canonical open fields sans id. */
export function tableIdOf(open: Omit<OpenFrame, "id">): string {
  return sha256Hex(`${ARENA_DOMAIN}|open|${canonicalJson(open)}`);
}

/** The exact string a signed-lane signature covers for a room write. */
export function signingMessage(room: string, nonce: string, frameText: string): string {
  return `${room}|${nonce}|${frameText}`;
}

/** A fresh frame nonce: random hex, uniqueness plus the venue's duplicate-text filter. */
export function randomNonce(): string {
  return bytesToHex(randomBytes(16));
}

/**
 * The short, name-grammar-safe reference other frames use to name a table, derived from
 * the table id. One room can host many tables (a tournament), so join/act/result carry
 * this ref while `open` carries the full id. 64 bits of the hash, `t-<16 hex>`.
 */
export function tableRef(open: Pick<OpenFrame, "id">): string {
  return "t-" + open.id.slice(2, 18);
}

/** Build an `open` frame with its id filled in. */
export function makeOpen(fields: Omit<OpenFrame, "type" | "id" | "nonce"> & { nonce?: string }): OpenFrame {
  const core: Omit<OpenFrame, "id"> = {
    type: "open",
    from: fields.from,
    format: fields.format,
    params: fields.params,
    gate: fields.gate,
    seats: fields.seats,
    nonce: fields.nonce ?? randomNonce(),
    ...(fields.deadlineMs !== undefined ? { deadlineMs: fields.deadlineMs } : {}),
  };
  return { ...core, id: tableIdOf(core) };
}

export function makeJoin(
  open: Pick<OpenFrame, "id">,
  from: string,
  extra: { seat?: number; proof?: string } = {},
): JoinFrame {
  return {
    type: "join",
    from,
    table: tableRef(open),
    nonce: randomNonce(),
    ...(extra.seat !== undefined ? { seat: extra.seat } : {}),
    ...(extra.proof !== undefined ? { proof: extra.proof } : {}),
  };
}

export function makeStart(
  open: Pick<OpenFrame, "id">,
  from: string,
  order: string[],
  params?: Json,
): StartFrame {
  return {
    type: "start",
    from,
    table: tableRef(open),
    order,
    nonce: randomNonce(),
    ...(params !== undefined ? { params } : {}),
  };
}

export function makeAct(
  open: Pick<OpenFrame, "id">,
  from: string,
  fields: { step: string; hand?: number; data?: Json; blob?: string },
): ActFrame {
  return {
    type: "act",
    from,
    table: tableRef(open),
    step: fields.step,
    nonce: randomNonce(),
    ...(fields.hand !== undefined ? { hand: fields.hand } : {}),
    ...(fields.data !== undefined ? { data: fields.data } : {}),
    ...(fields.blob !== undefined ? { blob: fields.blob } : {}),
  };
}

export function makeResult(
  open: Pick<OpenFrame, "id">,
  from: string,
  fields: { outcome: Json; hand?: number },
): ResultFrame {
  return {
    type: "result",
    from,
    table: tableRef(open),
    outcome: fields.outcome,
    nonce: randomNonce(),
    ...(fields.hand !== undefined ? { hand: fields.hand } : {}),
  };
}

export function makeAbort(open: Pick<OpenFrame, "id">, from: string, reason?: string): AbortFrame {
  return {
    type: "abort",
    from,
    table: tableRef(open),
    nonce: randomNonce(),
    ...(reason !== undefined ? { reason } : {}),
  };
}

// ── encode / decode ──────────────────────────────────────────────────────────

/** Serialize a frame to its wire line. Throws if it exceeds the message cap. */
export function encodeFrame(frame: ArenaFrame): string {
  const line = ARENA_PREFIX + canonicalJson(frame);
  if (line.length > MAX_FRAME_CHARS) {
    throw new Error(
      `arena: frame is ${line.length} chars, over the ${MAX_FRAME_CHARS} cap — use the blob layer`,
    );
  }
  return line;
}

export function isArenaLine(text: string): boolean {
  return text.startsWith(ARENA_PREFIX);
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const HEX32_RE = /^0x[0-9a-f]{64}$/;

function str(v: unknown): v is string {
  return typeof v === "string";
}
function optStr(v: unknown): v is string | undefined {
  return v === undefined || typeof v === "string";
}
function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function optNum(v: unknown): v is number | undefined {
  return v === undefined || (typeof v === "number" && Number.isFinite(v));
}

/** Parse and validate one frame line. Fail-closed: null on anything malformed. */
export function decodeFrame(text: string): ArenaFrame | null {
  if (!isArenaLine(text)) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(ARENA_PREFIX.length));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const f = obj as Record<string, unknown>;
  if (!str(f.type) || !isDid(f.from) || !str(f.nonce)) return null;

  switch (f.type) {
    case "open": {
      if (!str(f.format) || !NAME_RE.test(f.format)) return null;
      if (!HEX32_RE.test(f.id as string)) return null;
      const seats = f.seats as Record<string, unknown> | undefined;
      if (!seats || !num(seats.min) || !num(seats.max) || seats.min < 1 || seats.max < seats.min) {
        return null;
      }
      if (typeof f.gate !== "object" || f.gate === null) return null;
      if (!optNum(f.deadlineMs)) return null;
      if (!("params" in f)) return null;
      // id must recompute from the rest — a forged id cannot masquerade as a table.
      const { id, ...core } = f as unknown as OpenFrame;
      if (tableIdOf(core) !== id) return null;
      return f as unknown as OpenFrame;
    }
    case "join":
      if (!NAME_RE.test(f.table as string)) return null;
      if (!optNum(f.seat) || !optStr(f.proof)) return null;
      return f as unknown as JoinFrame;
    case "start": {
      if (!NAME_RE.test(f.table as string)) return null;
      if (!Array.isArray(f.order) || !f.order.every((d) => isDid(d))) return null;
      return f as unknown as StartFrame;
    }
    case "act":
      if (!NAME_RE.test(f.table as string) || !str(f.step)) return null;
      if (!optNum(f.hand)) return null;
      if (f.blob !== undefined && !HEX32_RE.test(f.blob as string)) return null;
      return f as unknown as ActFrame;
    case "result":
      if (!NAME_RE.test(f.table as string) || !("outcome" in f)) return null;
      if (!optNum(f.hand)) return null;
      return f as unknown as ResultFrame;
    case "beat":
      if (!NAME_RE.test(f.table as string) || !optStr(f.note)) return null;
      return f as unknown as BeatFrame;
    case "abort":
      if (!NAME_RE.test(f.table as string) || !optStr(f.reason)) return null;
      return f as unknown as AbortFrame;
    default:
      return null;
  }
}
