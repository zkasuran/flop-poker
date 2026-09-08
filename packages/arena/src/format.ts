// SPDX-License-Identifier: Apache-2.0
//
// The format plugin contract — the "any type friendly" core. A format is a pure module:
// it builds a game state once seats are sealed, folds each signed act into that state
// fail-closed, and reports when the game is over and who won. Everything a format needs
// from the venue arrives as decoded, transport-verified frames; a format never fetches.
//
// A format registers a descriptor (id, kind, seats, a hash of its rules) so any client
// verifies the code it runs matches the descriptor others advertise. Adding a game is a
// plugin plus a descriptor. No gatekeeper.

import type { ActFrame, Json } from "./frames.js";

export type FormatKind = "simultaneous" | "sequential" | "shuffle";

export interface FormatDescriptor {
  id: string;
  version: string;
  kind: FormatKind;
  seats: { min: number; max: number };
  /** 0x + sha256 of the format's canonical rules string; pins code to advertisement. */
  rulesHash: string;
  /** where the installable SKILL.md for this format lives (served at /formats/<id>/skill.md). */
  skill: string;
}

/** The re-derivable result of a game. Winners is empty on a draw. */
export interface Outcome {
  winners: string[];
  scores?: Record<string, number>;
  detail?: Json;
}

export interface FormatContext {
  table: string;
  /** seat order as did:keys, sealed at start. */
  seats: string[];
  /** ms clock, for any deadline the format enforces. */
  now: number;
  /**
   * Blobs referenced by `act.blob`, resolved by the caller before folding. A format that
   * carries large payloads (a poker shuffle proof) reads them here rather than fetching,
   * so the reducer stays pure and synchronous.
   */
  blobs?: Record<string, string>;
}

export interface StepResult<S> {
  state: S;
  changed: boolean;
  /** when unchanged, why the act was rejected — for debugging, never trusted. */
  reason?: string;
}

export interface Format<S> {
  readonly id: string;
  readonly version: string;
  readonly kind: FormatKind;
  readonly seats: { min: number; max: number };
  readonly skill: string;
  /** The descriptor published to the registry; rulesHash pins the code. */
  descriptor(): FormatDescriptor;
  /** Build the initial game state once seats are sealed. */
  init(ctx: FormatContext, params: Json): S;
  /** Fold one signed act. Fail-closed: an invalid act returns the state unchanged. */
  step(state: S, act: ActFrame, ctx: FormatContext): StepResult<S>;
  isTerminal(state: S): boolean;
  outcome(state: S, ctx: FormatContext): Outcome;
}

export function unchanged<S>(state: S, reason: string): StepResult<S> {
  return { state, changed: false, reason };
}
export function changed<S>(state: S): StepResult<S> {
  return { state, changed: true };
}
