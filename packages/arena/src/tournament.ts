// SPDX-License-Identifier: Apache-2.0
//
// Tournaments over arena/1. A tournament is a durable note plus one coordination room the
// matches run in. Anyone can organize one (custom); the ones we curate are surfaced by a
// featured list signed with our DID, so "flagship" is an authenticated recommendation a
// client checks, never a privileged server capability. The coordinator is untrusted: every
// match result is re-derivable from its table transcript, so a false bracket advance is
// caught on recompute.

import { canonicalJson, tableRef } from "./frames.js";
import type { Json, OpenFrame } from "./frames.js";
import { sha256Hex } from "./bytes.js";
import { tryVerify } from "./identity.js";
import type { Identity } from "./identity.js";
import type { Gate } from "./gate.js";
import type { Technocore } from "./transport.js";

export type TourneyMode = "single-elim" | "round-robin";

export interface TourneyConfig {
  name: string;
  format: string;
  params: Json;
  gate: Gate;
  mode: TourneyMode;
  /** the coordination room matches run in (reused). */
  room: string;
  /** seeded players, did:keys, in seed order. */
  players: string[];
  by: string;
  createdMs: number;
}

export interface Tourney extends TourneyConfig {
  id: string;
}

export const TOURNEY_NS = "arena-tourney";
export const FEATURED_NS = "arena-featured";
export const FEATURED_KEY = "list";

export function tourneyId(config: TourneyConfig): string {
  return sha256Hex(`FLOP::arena::v1|tourney|${canonicalJson(config)}`);
}

export function makeTourney(config: TourneyConfig): Tourney {
  return { ...config, id: tourneyId(config) };
}

export function tourneyNote(id: string): { ns: string; key: string } {
  return { ns: TOURNEY_NS, key: id.replace(/^0x/, "").slice(0, 16) };
}

export async function publishTourney(tech: Technocore, t: Tourney): Promise<void> {
  const { ns, key } = tourneyNote(t.id);
  await tech.setNote(ns, key, canonicalJson(t));
}

export async function readTourney(tech: Technocore, id: string): Promise<Tourney | null> {
  const { ns, key } = tourneyNote(id);
  const raw = await tech.getNote(ns, key);
  if (raw === null) return null;
  try {
    const t = JSON.parse(raw) as Tourney;
    return tourneyId({ ...t }) === id || t.id === id ? t : null;
  } catch {
    return null;
  }
}

// ── bracket helpers (pure) ─────────────────────────────────────────────────

export interface Match {
  a: string;
  b: string;
  round: number;
}

/** All unordered pairs, for round-robin. */
export function roundRobin(players: string[]): Match[] {
  const out: Match[] = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) out.push({ a: players[i]!, b: players[j]!, round: 0 });
  }
  return out;
}

/** Pair an ordered list into one single-elimination round; a lone odd player gets a bye. */
export function singleElimRound(players: string[], round: number): { matches: Match[]; byes: string[] } {
  const matches: Match[] = [];
  const byes: string[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) matches.push({ a: players[i]!, b: players[i + 1]!, round });
  if (players.length % 2 === 1) byes.push(players[players.length - 1]!);
  return { matches, byes };
}

/** Advance winners plus byes to the next round, preserving order. */
export function advance(matches: Match[], winnerOf: (m: Match) => string | null, byes: string[]): string[] {
  const next: string[] = [];
  for (const m of matches) {
    const w = winnerOf(m);
    if (w) next.push(w);
  }
  return [...next, ...byes];
}

/** Round-robin standings: a win is 1 point, a draw 0. */
export function standings(matches: Match[], winnerOf: (m: Match) => string | null): Record<string, number> {
  const table: Record<string, number> = {};
  for (const m of matches) {
    table[m.a] ??= 0;
    table[m.b] ??= 0;
    const w = winnerOf(m);
    if (w) table[w] = (table[w] ?? 0) + 1;
  }
  return table;
}

/** The room + table naming a coordinator uses to open one tournament match. */
export function matchOpenFields(t: Tourney, m: Match): { room: string; players: [string, string] } {
  return { room: t.room, players: [m.a, m.b] };
}

export function tableRefOf(open: OpenFrame): string {
  return tableRef(open);
}

// ── featured (flagship) list, signed by our DID ────────────────────────────

export interface Featured {
  tourneys: string[];
  issuedMs: number;
}

/** The note value for a featured list: the list plus the curator DID and a signature. */
export function signFeatured(identity: Identity, featured: Featured): string {
  const payload = canonicalJson(featured);
  return canonicalJson({ featured, did: identity.did, sig: identity.sign(`arena-featured|${payload}`) });
}

/** Verify a featured-list note against the expected curator DID. Null if it does not check. */
export function verifyFeatured(value: string, curatorDid: string): Featured | null {
  try {
    const parsed = JSON.parse(value) as { featured: Featured; did: string; sig: string };
    if (parsed.did !== curatorDid) return null;
    const payload = canonicalJson(parsed.featured);
    if (!tryVerify(parsed.did, parsed.sig, `arena-featured|${payload}`)) return null;
    if (!Array.isArray(parsed.featured.tourneys)) return null;
    return parsed.featured;
  } catch {
    return null;
  }
}

export async function readFeatured(tech: Technocore, curatorDid: string): Promise<Featured | null> {
  const raw = await tech.getNote(FEATURED_NS, FEATURED_KEY);
  return raw === null ? null : verifyFeatured(raw, curatorDid);
}
