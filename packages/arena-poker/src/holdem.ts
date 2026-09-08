// SPDX-License-Identifier: Apache-2.0
//
// The complete Texas Hold'em hand, as a pure public-view reducer over the choreography that
// arena `act` frames carry. It threads the trustless card crypto (aggregate keygen,
// verifiable shuffle in turn, threshold unmask) through the betting engine and the showdown.
//
// Privacy is exact: the public reducer only learns a hole card once every seat's unmask
// share for that position exists, which for a hole card is the n-1 dealt shares plus the
// holder's own share posted at showdown. So a folded or watching party never sees a live
// hole card, and a shown hand at showdown is proven against the committed deck.
//
// Burns are skipped on purpose: a burn card guards against marked physical decks and buys
// nothing in mental poker. Every other rule is here.

import { aggregate, combineUnmask, keygen, pkOf, unmaskShareD, verifyKeyProof, verifyUnmaskShare } from "./vtmf.js";
import type { KeyProofWire, KeyShare, UnmaskShareWire } from "./vtmf.js";
import { cipherFromWire, cipherToWire, trivial, type CipherWire } from "./elgamal.js";
import { cardPoints, cardIndexOf, pointFromB64, pointToB64 } from "./group.js";
import { proveShuffle, shuffle, verifyShuffle, type ShuffleProofWire } from "./shuffle.js";
import { applyBet, bettingComplete, contenders, startStreet, type BetAction, type BettingState } from "./betting.js";
import { awardPots, buildPots } from "./pots.js";
import { bestRankOfIndices, Category, type HandRank } from "./handeval.js";

export type Phase =
  | "keygen"
  | "shuffle"
  | "deal"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "complete";

export interface HandConfig {
  seats: string[]; // did per seat index
  stacks: number[];
  button: number;
  sb: number;
  bb: number;
  /** binds proofs to this hand, e.g. `${tableRef}|h${handNo}`. */
  label: string;
}

export type PokerStep =
  | { kind: "key"; seat: number; proof: KeyProofWire }
  | { kind: "shuffle"; seat: number; deck: CipherWire[]; proof: ShuffleProofWire }
  | { kind: "unmask"; seat: number; pos: number; share: UnmaskShareWire }
  | { kind: "bet"; seat: number; action: BetAction }
  | { kind: "reveal"; seat: number; pos: number; share: UnmaskShareWire }; // showdown own-hole

export interface HandState {
  cfg: HandConfig;
  n: number;
  phase: Phase;
  keyProofs: (KeyProofWire | null)[];
  aggKeyB64: string | null;
  deck: CipherWire[] | null;
  shuffleTurn: number; // how many seats have shuffled
  shares: Map<number, Map<number, UnmaskShareWire>>; // pos -> seat -> share
  revealed: Map<number, number>; // pos -> card index once all shares present
  community: number[]; // revealed community card indices in order
  street: BettingState | null;
  committedTotal: number[];
  folded: boolean[];
  allin: boolean[];
  stacks: number[];
  holeCards: (number[] | null)[]; // per seat, once shown at showdown
  payouts: number[] | null;
  reason?: string;
}

export interface StepResult {
  state: HandState;
  ok: boolean;
  reason?: string;
}

const HOLE = 2;

function holePositions(seat: number, n: number): number[] {
  return [seat, seat + n];
}
function communityPositions(n: number): { flop: number[]; turn: number; river: number } {
  const base = HOLE * n;
  return { flop: [base, base + 1, base + 2], turn: base + 3, river: base + 4 };
}
function seatOfHole(pos: number, n: number): number {
  return pos < n ? pos : pos - n;
}

function ok(state: HandState): StepResult {
  return { state, ok: true };
}
function no(state: HandState, reason: string): StepResult {
  return { state, ok: false, reason };
}

export function initHand(cfg: HandConfig): HandState {
  const n = cfg.seats.length;
  return {
    cfg,
    n,
    phase: "keygen",
    keyProofs: new Array<KeyProofWire | null>(n).fill(null),
    aggKeyB64: null,
    deck: null,
    shuffleTurn: 0,
    shares: new Map(),
    revealed: new Map(),
    community: [],
    street: null,
    committedTotal: new Array<number>(n).fill(0),
    folded: new Array<boolean>(n).fill(false),
    allin: new Array<boolean>(n).fill(false),
    stacks: cfg.stacks.slice(),
    holeCards: new Array<number[] | null>(n).fill(null),
    payouts: null,
  };
}

function aggKey(state: HandState) {
  return pointFromB64(state.aggKeyB64!);
}

function label(state: HandState, suffix: string): string {
  return `${state.cfg.label}|${suffix}`;
}

/** Set up the preflop street: post blinds, compute action order, first to act. */
function beginPreflop(state: HandState): void {
  const { n } = state;
  const b = state.cfg.button;
  const sbSeat = n === 2 ? b : (b + 1) % n;
  const bbSeat = n === 2 ? (b + 1) % n : (b + 2) % n;
  const firstToAct = n === 2 ? b : (b + 3) % n;
  const pre = new Array<number>(n).fill(0);
  const post = (seat: number, amount: number) => {
    const pay = Math.min(amount, state.stacks[seat] ?? 0);
    pre[seat] = pay;
    state.stacks[seat] = (state.stacks[seat] ?? 0) - pay;
    if (state.stacks[seat] === 0) state.allin[seat] = true;
  };
  post(sbSeat, state.cfg.sb);
  post(bbSeat, state.cfg.bb);
  const order = Array.from({ length: n }, (_, i) => (firstToAct + i) % n);
  state.street = startStreet({
    order,
    stack: state.stacks,
    folded: state.folded,
    allin: state.allin,
    bigBlind: state.cfg.bb,
    preCommitted: pre,
    firstToActSeat: firstToAct,
  });
  state.phase = "preflop";
}

function beginPostflopStreet(state: HandState, phase: Phase): void {
  const { n } = state;
  const b = state.cfg.button;
  const firstToAct = n === 2 ? (b + 1) % n : (b + 1) % n;
  const order = Array.from({ length: n }, (_, i) => (firstToAct + i) % n);
  state.street = startStreet({
    order,
    stack: state.stacks,
    folded: state.folded,
    allin: state.allin,
    bigBlind: state.cfg.bb,
    firstToActSeat: firstToAct,
  });
  state.phase = phase;
}

/** Fold a completed street's chips into the hand totals. */
function closeStreet(state: HandState): void {
  const s = state.street!;
  for (let i = 0; i < state.n; i += 1) {
    state.committedTotal[i] = (state.committedTotal[i] ?? 0) + (s.committed[i] ?? 0);
    state.stacks[i] = s.stack[i] ?? 0;
    state.folded[i] = s.folded[i] ?? false;
    state.allin[i] = s.allin[i] ?? false;
  }
  state.street = null;
}

function stillIn(state: HandState): number[] {
  return state.cfg.seats.map((_, i) => i).filter((i) => !state.folded[i]);
}

/** Everyone still in is all-in (or only one can act): no more betting is possible. */
function bettingDoneForHand(state: HandState): boolean {
  const live = stillIn(state).filter((i) => !state.allin[i]);
  return live.length <= 1;
}

function nextAfterStreet(state: HandState): void {
  const inHand = stillIn(state);
  if (inHand.length === 1) {
    settle(state);
    return;
  }
  const order: Phase[] = ["preflop", "flop", "turn", "river", "showdown"];
  const idx = order.indexOf(state.phase);
  const next = order[idx + 1]!;
  if (next === "showdown") {
    state.phase = "showdown";
    return;
  }
  // reveal that street's community first (needs all n unmask shares), so pause in a
  // reveal sub-phase by leaving street null and phase set to the street name; the reveal
  // completes when the community positions are known, then betting begins.
  state.phase = next;
  maybeOpenStreetBetting(state);
}

/** Once a street's community cards are revealed, open its betting (or skip if all-in). */
function maybeOpenStreetBetting(state: HandState): void {
  const cp = communityPositions(state.n);
  const need: number[] =
    state.phase === "flop" ? cp.flop : state.phase === "turn" ? [cp.turn] : state.phase === "river" ? [cp.river] : [];
  if (need.length === 0) return;
  if (!need.every((p) => state.revealed.has(p))) return; // still waiting on unmask shares
  for (const p of need) if (!state.community.includes(state.revealed.get(p)!)) state.community.push(state.revealed.get(p)!);
  if (bettingDoneForHand(state)) {
    // run out remaining streets without betting
    advanceRunout(state);
    return;
  }
  beginPostflopStreet(state, state.phase);
}

/** When all remaining are all-in, later streets just need their reveals then showdown. */
function advanceRunout(state: HandState): void {
  const order: Phase[] = ["flop", "turn", "river", "showdown"];
  const idx = order.indexOf(state.phase);
  const next = order[idx + 1];
  if (!next) return;
  if (next === "showdown") {
    state.phase = "showdown";
    return;
  }
  state.phase = next;
  maybeOpenStreetBetting(state);
}

function rankOf(state: HandState, seat: number): HandRank | null {
  if (state.folded[seat]) return null;
  const hole = state.holeCards[seat];
  if (!hole) return null;
  return bestRankOfIndices([...hole, ...state.community]);
}

/** Compute pots and payouts and finish the hand. */
function settle(state: HandState): void {
  const inHand = stillIn(state);
  const pots = buildPots(state.committedTotal, state.folded);
  const order = Array.from({ length: state.n }, (_, i) => (state.cfg.button + 1 + i) % state.n);
  let won: number[];
  if (inHand.length === 1) {
    const sole = inHand[0]!;
    won = awardPots(pots, (s) => (s === sole ? [Category.STRAIGHT_FLUSH, 99] : null), order, state.n);
  } else {
    won = awardPots(pots, (s) => rankOf(state, s), order, state.n);
  }
  state.payouts = state.stacks.map((st, i) => st + (won[i] ?? 0));
  state.stacks = state.payouts.slice();
  state.phase = "complete";
}

export function applyStep(prev: HandState, step: PokerStep): StepResult {
  const state: HandState = structuredCloneState(prev);
  const seat = step.seat;
  if (seat < 0 || seat >= state.n) return no(prev, "bad seat");

  switch (step.kind) {
    case "key": {
      if (state.phase !== "keygen") return no(prev, "not in keygen");
      if (state.keyProofs[seat]) return no(prev, "seat already keyed");
      if (!verifyKeyProof(step.proof, label(state, `key${seat}`))) return no(prev, "bad key proof");
      state.keyProofs[seat] = step.proof;
      if (state.keyProofs.every((p) => p !== null)) {
        state.aggKeyB64 = aggKeyFromProofs(state.keyProofs as KeyProofWire[]);
        state.deck = cardPoints().map((m) => cipherToWire(trivial(m)));
        state.phase = "shuffle";
      }
      return ok(state);
    }

    case "shuffle": {
      if (state.phase !== "shuffle") return no(prev, "not in shuffle");
      if (seat !== state.shuffleTurn) return no(prev, "not this seat's shuffle turn");
      const input = state.deck!.map(cipherFromWire);
      const output = step.deck.map(cipherFromWire);
      if (output.length !== 52) return no(prev, "deck must be 52 cards");
      if (!verifyShuffle(aggKey(state), input, output, step.proof)) return no(prev, "bad shuffle proof");
      state.deck = step.deck;
      state.shuffleTurn += 1;
      if (state.shuffleTurn === state.n) state.phase = "deal";
      return ok(state);
    }

    case "unmask": {
      if (state.phase !== "deal" && state.phase !== "flop" && state.phase !== "turn" && state.phase !== "river") {
        return no(prev, "no reveal expected now");
      }
      const posOk = expectedUnmaskPosition(state, step.pos, seat, false);
      if (!posOk.ok) return no(prev, posOk.reason!);
      if (!storeShare(state, step.pos, seat, step.share)) return no(prev, "bad unmask share");
      afterShare(state, step.pos);
      // Hole positions only ever reach n-1 shares during the deal (the holder withholds
      // its own), so deal completion is checked here rather than on a full reveal.
      if (state.phase === "deal") maybeFinishDeal(state);
      return ok(state);
    }

    case "reveal": {
      if (state.phase !== "showdown") return no(prev, "not in showdown");
      if (state.folded[seat]) return no(prev, "folded seats do not reveal");
      if (!holePositions(seat, state.n).includes(step.pos)) return no(prev, "not your hole card");
      if (!storeShare(state, step.pos, seat, step.share)) return no(prev, "bad reveal share");
      afterShare(state, step.pos);
      maybeShowdownComplete(state);
      return ok(state);
    }

    case "bet": {
      if (!["preflop", "flop", "turn", "river"].includes(state.phase) || !state.street) {
        return no(prev, "no betting now");
      }
      const r = applyBet(state.street, step.action);
      if (!r.ok) return no(prev, r.reason ?? "illegal bet");
      state.street = r.state;
      if (bettingComplete(state.street)) {
        closeStreet(state);
        nextAfterStreet(state);
      }
      return ok(state);
    }

    default:
      return no(prev, "unknown step");
  }
}

// ── helpers that need crypto/state ───────────────────────────────────────────

function aggKeyFromProofs(proofs: KeyProofWire[]): string {
  return pointToB64(aggregate(proofs.map((p) => pkOf(p))));
}

function expectedUnmaskPosition(state: HandState, pos: number, seat: number, showdown: boolean): { ok: boolean; reason?: string } {
  const cp = communityPositions(state.n);
  if (state.phase === "deal") {
    // hole positions, contributor must NOT be the holder
    const holePosAll = state.cfg.seats.flatMap((_, s) => holePositions(s, state.n));
    if (!holePosAll.includes(pos)) return { ok: false, reason: "not a hole position" };
    if (seatOfHole(pos, state.n) === seat) return { ok: false, reason: "holder does not deal-unmask own card" };
    return { ok: true };
  }
  const need = state.phase === "flop" ? cp.flop : state.phase === "turn" ? [cp.turn] : [cp.river];
  if (!need.includes(pos)) return { ok: false, reason: "not this street's community position" };
  return { ok: true };
}

function storeShare(state: HandState, pos: number, seat: number, share: UnmaskShareWire): boolean {
  const ct = cipherFromWire(state.deck![pos]!);
  const pk = pkOf(state.keyProofs[seat]!);
  if (!verifyUnmaskShare(share, ct, pk, label(state, `pos${pos}`))) return false;
  let m = state.shares.get(pos);
  if (!m) {
    m = new Map();
    state.shares.set(pos, m);
  }
  if (m.has(seat)) return false; // no double-contribution
  m.set(seat, share);
  return true;
}

/** When a position has all n shares, combine to its card index. */
function afterShare(state: HandState, pos: number): void {
  const m = state.shares.get(pos);
  if (!m || m.size !== state.n) return;
  if (state.revealed.has(pos)) return;
  const ct = cipherFromWire(state.deck![pos]!);
  const contributions = [...m.values()].map((w) => unmaskShareD(w));
  const point = combineUnmask(ct, contributions);
  const idx = cardIndexOf(point);
  if (idx < 0) return; // should not happen with honest shares; leave unrevealed
  state.revealed.set(pos, idx);
  // If this is a community position and we are mid-street, try to open betting.
  if (state.phase === "flop" || state.phase === "turn" || state.phase === "river") {
    maybeOpenStreetBetting(state);
  }
  // If deal is finished (all hole positions have their n-1 shares), move to preflop.
  if (state.phase === "deal") maybeFinishDeal(state);
}

function maybeFinishDeal(state: HandState): void {
  const holePosAll = state.cfg.seats.flatMap((_, s) => holePositions(s, state.n));
  const done = holePosAll.every((pos) => (state.shares.get(pos)?.size ?? 0) === state.n - 1);
  if (done) beginPreflop(state);
}

function maybeShowdownComplete(state: HandState): void {
  const inHand = stillIn(state);
  // each remaining seat needs both hole positions fully revealed (n shares each)
  for (const s of inHand) {
    for (const pos of holePositions(s, state.n)) {
      if (!state.revealed.has(pos)) return;
    }
  }
  for (const s of inHand) {
    state.holeCards[s] = holePositions(s, state.n).map((pos) => state.revealed.get(pos)!);
  }
  settle(state);
}

export function handComplete(state: HandState): boolean {
  return state.phase === "complete";
}

// deep-ish clone that preserves Maps
function structuredCloneState(s: HandState): HandState {
  const shares = new Map<number, Map<number, UnmaskShareWire>>();
  for (const [pos, m] of s.shares) shares.set(pos, new Map(m));
  return {
    ...s,
    keyProofs: s.keyProofs.slice(),
    deck: s.deck ? s.deck.slice() : null,
    shares,
    revealed: new Map(s.revealed),
    community: s.community.slice(),
    street: s.street ? { ...s.street, order: s.street.order, stack: s.street.stack.slice(), committed: s.street.committed.slice(), folded: s.street.folded.slice(), allin: s.street.allin.slice(), acted: s.street.acted.slice() } : null,
    committedTotal: s.committedTotal.slice(),
    folded: s.folded.slice(),
    allin: s.allin.slice(),
    stacks: s.stacks.slice(),
    holeCards: s.holeCards.map((h) => (h ? h.slice() : null)),
    payouts: s.payouts ? s.payouts.slice() : null,
  };
}

// ── dealer-side helpers for building the crypto artifacts (used by bots/tests) ──

/** Everything a seat holds privately for a hand: its key share. */
export interface SeatSecret {
  share: KeyShare;
}

export function newSeatSecret(): SeatSecret {
  return { share: keygen() };
}

/** Perform this seat's shuffle of the current deck, returning the new deck + proof. */
export function seatShuffle(aggKeyB64: string, deck: CipherWire[], rounds?: number): { deck: CipherWire[]; proof: ShuffleProofWire } {
  const pk = pointFromB64(aggKeyB64);
  const input = deck.map(cipherFromWire);
  const { output, secret } = shuffle(pk, input);
  const proof = proveShuffle(pk, input, output, secret, rounds);
  return { deck: output.map(cipherToWire), proof };
}
