// SPDX-License-Identifier: Apache-2.0
//
// The table machine: a pure fold of signed frames into table state through a format.
// One `open` declares a table, `join`s are admitted per gate, the opener seals seating
// with `start`, then `act`s drive the format to a terminal outcome. Everything is
// re-derivable from the transcript, so no participant is trusted: a client folds the
// same records and reaches the same state, and a coordinator that posts a false `result`
// is simply ignored because the outcome comes from the acts, not the claim.
//
// Poker runs many hands with carried chips at one table; that multi-hand session lives in
// @flop-poker/arena-poker on top of these same frames. This machine plays one game.

import { admit } from "./gate.js";
import type { Gate, GateContext } from "./gate.js";
import { decodeFrame, tableRef } from "./frames.js";
import type { ArenaFrame, JoinFrame, OpenFrame } from "./frames.js";
import type { Format, FormatContext, Outcome } from "./format.js";
import { verifyRecord } from "./transport.js";
import type { Record } from "./transport.js";

export type Phase = "seating" | "playing" | "done" | "aborted";

export interface TableState<S> {
  open: OpenFrame;
  format: Format<S>;
  phase: Phase;
  /** dids admitted via join, in join order. */
  admitted: string[];
  /** sealed seat order after start. */
  seats: string[];
  game: S | null;
  outcome: Outcome | null;
  aborted?: string;
}

/** Gate facts the pure machine cannot look up itself (stake locked, DID published). */
export interface GateOverrides {
  stakeVerified?: (join: JoinFrame) => boolean;
  didPublished?: (join: JoinFrame) => boolean;
}

export function openTable<S>(open: OpenFrame, format: Format<S>): TableState<S> {
  return { open, format, phase: "seating", admitted: [], seats: [], game: null, outcome: null };
}

function gateOk(open: OpenFrame, join: JoinFrame, seatsTaken: number, overrides?: GateOverrides): boolean {
  const ctx: GateContext = {
    table: open.id,
    seatsTaken,
    seatsMax: open.seats.max,
    stakeVerified: overrides?.stakeVerified?.(join),
    didPublished: overrides?.didPublished?.(join),
  };
  return admit(open.gate as Gate, join, ctx).ok;
}

/** Apply one frame. Pure and fail-closed: an invalid frame returns the state unchanged. */
export function applyFrame<S>(
  t: TableState<S>,
  frame: ArenaFrame,
  now: number,
  overrides?: GateOverrides,
): TableState<S> {
  if (t.phase === "done" || t.phase === "aborted") return t;

  switch (frame.type) {
    case "join": {
      if (t.phase !== "seating") return t;
      if (t.open.deadlineMs !== undefined && now > t.open.deadlineMs) return t;
      if (t.admitted.includes(frame.from)) return t; // one seat per did
      if (t.admitted.length >= t.open.seats.max) return t;
      if (!gateOk(t.open, frame, t.admitted.length, overrides)) return t;
      return { ...t, admitted: [...t.admitted, frame.from] };
    }
    case "start": {
      if (t.phase !== "seating") return t;
      if (frame.from !== t.open.from) return t; // the opener seals seating
      const order = frame.order;
      if (order.length < t.open.seats.min || order.length > t.open.seats.max) return t;
      if (new Set(order).size !== order.length) return t;
      if (!order.every((d) => t.admitted.includes(d))) return t;
      const ctx: FormatContext = { table: tableRef(t.open), seats: order, now };
      return { ...t, phase: "playing", seats: order, game: t.format.init(ctx, t.open.params) };
    }
    case "act": {
      if (t.phase !== "playing" || t.game === null) return t;
      if (!t.seats.includes(frame.from)) return t;
      const ctx: FormatContext = { table: tableRef(t.open), seats: t.seats, now };
      const res = t.format.step(t.game, frame, ctx);
      const next: TableState<S> = { ...t, game: res.state };
      if (res.changed && t.format.isTerminal(res.state)) {
        next.phase = "done";
        next.outcome = t.format.outcome(res.state, ctx);
      }
      return next;
    }
    case "abort": {
      const party =
        frame.from === t.open.from || t.seats.includes(frame.from) || t.admitted.includes(frame.from);
      if (!party) return t;
      return { ...t, phase: "aborted", aborted: frame.reason ?? "aborted" };
    }
    default:
      // `open` is what built the table; `result` is a claim we recompute, never trust;
      // `beat` is liveness. None change state here.
      return t;
  }
}

/**
 * Turn raw room records into this table's ordered frames: drop anything whose signature
 * does not verify, whose text is not an arena frame, whose in-frame `from` disagrees with
 * the transport `from`, or that names a different table.
 */
export function tableFrames(room: string, open: OpenFrame, records: Record[]): ArenaFrame[] {
  const ref = tableRef(open);
  const out: ArenaFrame[] = [];
  for (const r of records) {
    if (!verifyRecord(room, r)) continue;
    const f = decodeFrame(r.text);
    if (!f) continue;
    if (f.from !== r.from) continue;
    if (f.type === "open") {
      if (f.id !== open.id) continue;
    } else if (f.table !== ref) {
      continue;
    }
    out.push(f);
  }
  return out;
}

/** Fold a full record history into terminal (or current) table state. */
export function foldTable<S>(
  room: string,
  open: OpenFrame,
  format: Format<S>,
  records: Record[],
  opts: { now?: number; overrides?: GateOverrides } = {},
): TableState<S> {
  const now = opts.now ?? Date.now();
  let t = openTable(open, format);
  for (const frame of tableFrames(room, open, records)) {
    t = applyFrame(t, frame, now, opts.overrides);
  }
  return t;
}
