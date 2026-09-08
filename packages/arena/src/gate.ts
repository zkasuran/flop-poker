// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// Gating: who may take a seat. A gate is declared in the `open` frame and enforced by
// admit() on the client. It is a convention clients honor, not a server capability —
// but joins are signed, so a client that seats someone against the gate produces a
// transcript anyone can catch. Trust flows from the signed frames, never from a peer's
// good behavior.

import { ARENA_DOMAIN } from "./frames.js";
import { sha256Hex } from "./bytes.js";
import { isDid } from "./identity.js";
import type { JoinFrame } from "./frames.js";

export type Gate =
  | { kind: "open" }
  | { kind: "allow"; dids: string[] }
  /** join.proof is the passcode; commit binds it to the table so it cannot be lifted. */
  | { kind: "pass"; commit: string }
  /** join.proof is a locked tclk contract id; the caller verifies it against the rail. */
  | { kind: "stake"; asset: string; amount: string; rail: string }
  /** join.from must have a published DID note; the caller resolves that. */
  | { kind: "didpub" };

/** The commitment an opener publishes for a `pass` gate, bound to the table id. */
export function passCommit(table: string, passcode: string): string {
  return sha256Hex(`${ARENA_DOMAIN}|pass|${table}|${passcode}`);
}

/** Facts a client resolves before admitting, for gates that need a lookup. */
export interface GateContext {
  table: string;
  seatsTaken: number;
  seatsMax: number;
  /** the caller verified join.proof is a locked stake contract on the named rail. */
  stakeVerified?: boolean;
  /** the caller resolved that join.from has a published DID note. */
  didPublished?: boolean;
}

export interface Admission {
  ok: boolean;
  reason?: string;
}

/** Decide whether a signed join is admitted under the gate. Pure and fail-closed. */
export function admit(gate: Gate, join: JoinFrame, ctx: GateContext): Admission {
  if (ctx.seatsTaken >= ctx.seatsMax) return { ok: false, reason: "table is full" };
  if (!isDid(join.from)) return { ok: false, reason: "join is not signed by a did:key" };
  switch (gate.kind) {
    case "open":
      return { ok: true };
    case "allow":
      return gate.dids.includes(join.from)
        ? { ok: true }
        : { ok: false, reason: "not on the allow list" };
    case "pass":
      if (typeof join.proof !== "string") return { ok: false, reason: "passcode required" };
      return passCommit(ctx.table, join.proof) === gate.commit
        ? { ok: true }
        : { ok: false, reason: "wrong passcode" };
    case "stake":
      return ctx.stakeVerified
        ? { ok: true }
        : { ok: false, reason: "stake contract not verified as locked" };
    case "didpub":
      return ctx.didPublished
        ? { ok: true }
        : { ok: false, reason: "no published DID note for this key" };
    default:
      return { ok: false, reason: "unknown gate" };
  }
}
