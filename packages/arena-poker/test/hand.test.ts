// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// The required end-to-end proof: a complete three-handed Texas Hold'em hand played to
// showdown with an all-in side pot, using real mental-poker crypto for keygen, the
// verifiable shuffle, and every threshold unmask. The hand is driven purely by the public
// reducer, and its result is re-derived independently from the revealed cards.

import { describe, expect, it } from "vitest";

import { cipherFromWire } from "../src/elgamal.js";
import { proveKey, unmaskShare } from "../src/vtmf.js";
import {
  applyStep,
  handComplete,
  initHand,
  newSeatSecret,
  seatShuffle,
  type HandConfig,
  type HandState,
  type PokerStep,
  type SeatSecret,
} from "../src/holdem.js";
import type { BetAction } from "../src/betting.js";
import { buildPots, awardPots } from "../src/pots.js";
import { bestRankOfIndices } from "../src/handeval.js";

const N = 3;
const holePos = (seat: number) => [seat, seat + N];
const community = () => {
  const base = 2 * N;
  return { flop: [base, base + 1, base + 2], turn: base + 3, river: base + 4 };
};

function must(r: { state: HandState; ok: boolean; reason?: string }): HandState {
  if (!r.ok) throw new Error("step rejected: " + r.reason);
  return r.state;
}

type BetPlan = Record<string, BetAction[]>;

function simulate(cfg: HandConfig, plan: BetPlan): HandState {
  const secrets: SeatSecret[] = cfg.seats.map(() => newSeatSecret());
  let state = initHand(cfg);

  // keygen
  for (let s = 0; s < N; s += 1) {
    state = must(applyStep(state, { kind: "key", seat: s, proof: proveKey(secrets[s]!.share, `${cfg.label}|key${s}`) }));
  }
  // shuffle in turn (small rounds; soundness is covered by crypto.test.ts)
  for (let s = 0; s < N; s += 1) {
    const { deck, proof } = seatShuffle(state.aggKeyB64!, state.deck!, 6);
    state = must(applyStep(state, { kind: "shuffle", seat: s, deck, proof }));
  }
  const deck = state.deck!;
  const share = (seat: number, pos: number) =>
    unmaskShare(secrets[seat]!.share, cipherFromWire(deck[pos]!), `${cfg.label}|pos${pos}`);
  const unmaskStep = (seat: number, pos: number): PokerStep => ({ kind: "unmask", seat, pos, share: share(seat, pos) });

  // deal: every non-holder contributes to each hole position
  for (let s = 0; s < N; s += 1) {
    for (const pos of holePos(s)) {
      for (let c = 0; c < N; c += 1) if (c !== s) state = must(applyStep(state, unmaskStep(c, pos)));
    }
  }

  const cp = community();
  const streetNeeds: Record<string, number[]> = { flop: cp.flop, turn: [cp.turn], river: [cp.river] };
  for (const st of ["preflop", "flop", "turn", "river"] as const) {
    if (handComplete(state)) break;
    // reveal this street's community (all seats contribute), if we are on it
    if (st !== "preflop" && state.phase === st) {
      for (const pos of streetNeeds[st]!) {
        for (let c = 0; c < N; c += 1) if (!state.shares.get(pos)?.has(c)) state = must(applyStep(state, unmaskStep(c, pos)));
      }
    }
    // betting for this street, if it opened
    if (state.phase === st && state.street) {
      for (const action of plan[st] ?? []) {
        if (!state.street) break;
        state = must(applyStep(state, { kind: "bet", seat: action.seat, action }));
      }
    }
  }

  // showdown: remaining seats reveal their own hole cards
  if (state.phase === "showdown") {
    for (let s = 0; s < N; s += 1) {
      if (state.folded[s]) continue;
      for (const pos of holePos(s)) state = must(applyStep(state, { kind: "reveal", seat: s, pos, share: share(s, pos) }));
    }
  }
  return state;
}

describe("complete 3-handed Hold'em to showdown with a side pot", () => {
  it("plays the whole hand on real crypto and settles correctly", () => {
    const cfg: HandConfig = {
      seats: ["did:key:z6MkA", "did:key:z6MkB", "did:key:z6MkC"], // placeholders; seat index is what matters here
      stacks: [100, 500, 500],
      button: 0,
      sb: 10,
      bb: 20,
      label: "t-abcdef0123456789|h0",
    };
    // seat0 (button, 100) shoves preflop; seat1, seat2 call, then bet 200 on the flop.
    const plan: BetPlan = {
      preflop: [
        { seat: 0, type: "allin" },
        { seat: 1, type: "call" },
        { seat: 2, type: "call" },
      ],
      flop: [
        { seat: 1, type: "bet", to: 200 },
        { seat: 2, type: "call" },
      ],
      turn: [
        { seat: 1, type: "check" },
        { seat: 2, type: "check" },
      ],
      river: [
        { seat: 1, type: "check" },
        { seat: 2, type: "check" },
      ],
    };

    const state = simulate(cfg, plan);

    // 1) the hand completed
    expect(handComplete(state)).toBe(true);

    // 2) chip conservation
    const startTotal = cfg.stacks.reduce((a, b) => a + b, 0);
    const endTotal = state.payouts!.reduce((a, b) => a + b, 0);
    expect(endTotal).toBe(startTotal);

    // 3) side-pot structure: seat0 all-in 100, others 300 -> main 300 {0,1,2}, side 400 {1,2}
    expect(state.committedTotal).toEqual([100, 300, 300]);
    const pots = buildPots(state.committedTotal, state.folded);
    expect(pots).toEqual([
      { amount: 300, eligible: [0, 1, 2] },
      { amount: 400, eligible: [1, 2] },
    ]);

    // 4) every dealt and community card is distinct -> the verifiable shuffle kept a real deck
    const dealt = [
      ...holePos(0),
      ...holePos(1),
      ...holePos(2),
      ...community().flop,
      community().turn,
      community().river,
    ].map((pos) => state.revealed.get(pos)!);
    expect(new Set(dealt).size).toBe(dealt.length);

    // 5) independent settlement from the revealed cards matches the reducer's payouts
    const board = state.community;
    const rankOf = (seat: number) =>
      state.folded[seat] || !state.holeCards[seat] ? null : bestRankOfIndices([...state.holeCards[seat]!, ...board]);
    const order = [1, 2, 0]; // from button+1
    const expectedWon = awardPots(pots, rankOf, order, N);
    const stacksAfterBetting = cfg.stacks.map((s, i) => s - (state.committedTotal[i] ?? 0));
    const reducerWon = state.payouts!.map((p, i) => p - (stacksAfterBetting[i] ?? 0));
    expect(reducerWon).toEqual(expectedWon);

    // 6) seat0 (short all-in) can never win side-pot chips
    expect(reducerWon[0]!).toBeLessThanOrEqual(300);
  });
});
