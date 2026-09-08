// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// One street of betting. Pure reducer: it validates and applies fold / check / call / bet /
// raise / all-in in turn order, enforces the min-raise rule, tracks the current bet and
// each seat's commitment, and reports when the street is closed (everyone still in has
// matched the bet and has had a turn since the last aggression).
//
// One deliberate simplification, noted honestly: a short all-in (less than a full raise)
// raises the amount to call but is treated as not granting a fresh full-raise right to
// players who had already matched. This affects only the legality of a re-raise in a rare
// spot, never the chips in the pot or the showdown.

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface BetAction {
  seat: number;
  type: ActionType;
  /** total this-street commitment after a bet or raise. */
  to?: number;
}

export interface BettingState {
  order: number[];
  stack: number[];
  committed: number[];
  folded: boolean[];
  allin: boolean[];
  acted: boolean[];
  currentBet: number;
  minRaise: number;
  bigBlind: number;
  ptr: number; // index into order of the seat to act, or -1 when the street is closed
}

export interface BetResult {
  state: BettingState;
  ok: boolean;
  reason?: string;
}

function clone(s: BettingState): BettingState {
  return {
    order: s.order,
    stack: s.stack.slice(),
    committed: s.committed.slice(),
    folded: s.folded.slice(),
    allin: s.allin.slice(),
    acted: s.acted.slice(),
    currentBet: s.currentBet,
    minRaise: s.minRaise,
    bigBlind: s.bigBlind,
    ptr: s.ptr,
  };
}

function needsAction(s: BettingState, seat: number): boolean {
  return !s.folded[seat] && !s.allin[seat] && ((s.committed[seat] ?? 0) < s.currentBet || !s.acted[seat]);
}

function nextPtr(s: BettingState, fromExclusive: number): number {
  const n = s.order.length;
  for (let step = 1; step <= n; step += 1) {
    const idx = (fromExclusive + step) % n;
    if (needsAction(s, s.order[idx]!)) return idx;
  }
  return -1;
}

export function startStreet(init: {
  order: number[];
  stack: number[];
  folded: boolean[];
  allin: boolean[];
  bigBlind: number;
  preCommitted?: number[];
  firstToActSeat?: number;
}): BettingState {
  const n = init.stack.length;
  const committed = init.preCommitted ? init.preCommitted.slice() : new Array<number>(n).fill(0);
  const currentBet = committed.reduce((m, c) => Math.max(m, c), 0);
  const s: BettingState = {
    order: init.order,
    stack: init.stack.slice(),
    committed,
    folded: init.folded.slice(),
    allin: init.allin.slice(),
    acted: new Array<boolean>(n).fill(false),
    currentBet,
    minRaise: init.bigBlind,
    bigBlind: init.bigBlind,
    ptr: -1,
  };
  const startIdx = init.firstToActSeat !== undefined ? init.order.indexOf(init.firstToActSeat) : -1;
  s.ptr = nextPtr(s, startIdx === -1 ? init.order.length - 1 : startIdx - 1 + init.order.length);
  return s;
}

export function bettingComplete(s: BettingState): boolean {
  return s.ptr === -1;
}

/** Seats still contesting the pot (not folded). */
export function contenders(s: BettingState): number[] {
  return s.order.filter((seat) => !s.folded[seat]);
}

function commitTo(s: BettingState, seat: number, to: number): void {
  const pay = to - (s.committed[seat] ?? 0);
  s.committed[seat] = to;
  s.stack[seat] = (s.stack[seat] ?? 0) - pay;
  if (s.stack[seat] === 0) s.allin[seat] = true;
}

export function applyBet(state: BettingState, action: BetAction): BetResult {
  if (state.ptr === -1) return { state, ok: false, reason: "street already closed" };
  const seat = state.order[state.ptr]!;
  if (action.seat !== seat) return { state, ok: false, reason: "not this seat's turn" };

  const s = clone(state);
  const committed = s.committed[seat] ?? 0;
  const stack = s.stack[seat] ?? 0;
  const maxTo = committed + stack;

  const reopen = (): void => {
    for (const o of s.order) if (!s.folded[o] && !s.allin[o] && o !== seat) s.acted[o] = false;
  };

  switch (action.type) {
    case "fold":
      s.folded[seat] = true;
      s.acted[seat] = true;
      break;
    case "check":
      if (committed !== s.currentBet) return { state, ok: false, reason: "cannot check facing a bet" };
      s.acted[seat] = true;
      break;
    case "call": {
      if (committed >= s.currentBet) return { state, ok: false, reason: "nothing to call" };
      commitTo(s, seat, Math.min(s.currentBet, maxTo));
      s.acted[seat] = true;
      break;
    }
    case "bet":
    case "raise":
    case "allin": {
      const to = action.type === "allin" ? maxTo : action.to ?? 0;
      if (to > maxTo) return { state, ok: false, reason: "not enough chips" };
      if (to <= s.currentBet && !(action.type === "allin" && to === maxTo)) {
        return { state, ok: false, reason: "raise must exceed the current bet" };
      }
      const isAllin = to === maxTo;
      if (action.type === "bet" && s.currentBet !== 0) {
        return { state, ok: false, reason: "there is already a bet; use raise" };
      }
      if (action.type === "raise" && s.currentBet === 0) {
        return { state, ok: false, reason: "no bet to raise; use bet" };
      }
      const increment = to - s.currentBet;
      const minOpen = s.currentBet === 0 ? s.bigBlind : s.minRaise;
      if (!isAllin && increment < minOpen) {
        return { state, ok: false, reason: `raise increment ${increment} below minimum ${minOpen}` };
      }
      commitTo(s, seat, to);
      if (increment >= s.minRaise || s.currentBet === 0) s.minRaise = Math.max(increment, s.bigBlind);
      s.currentBet = to;
      reopen();
      s.acted[seat] = true;
      break;
    }
    default:
      return { state, ok: false, reason: "unknown action" };
  }

  s.ptr = nextPtr(s, s.ptr);
  return { state: s, ok: true };
}
