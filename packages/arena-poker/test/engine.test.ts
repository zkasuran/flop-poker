// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import { Category, bestRankOfIndices, cardFromIndex, compareRanks, rank5 } from "../src/handeval.js";
import { buildPots, awardPots } from "../src/pots.js";
import { applyBet, bettingComplete, contenders, startStreet } from "../src/betting.js";

// card index: rank = index%13 (0=2..12=A), suit = index/13 (0..3)
const card = (rank2to14: number, suit: number) => (rank2to14 - 2) + suit * 13;

describe("hand evaluation", () => {
  it("classifies the standard categories", () => {
    const royal = rank5([card(14, 3), card(13, 3), card(12, 3), card(11, 3), card(10, 3)].map(cardFromIndex));
    expect(royal[0]).toBe(Category.STRAIGHT_FLUSH);
    const quads = rank5([card(9, 0), card(9, 1), card(9, 2), card(9, 3), card(2, 0)].map(cardFromIndex));
    expect(quads[0]).toBe(Category.QUADS);
    const boat = rank5([card(9, 0), card(9, 1), card(9, 2), card(2, 0), card(2, 1)].map(cardFromIndex));
    expect(boat[0]).toBe(Category.FULL_HOUSE);
    const wheel = rank5([card(14, 0), card(2, 1), card(3, 2), card(4, 3), card(5, 0)].map(cardFromIndex));
    expect(wheel[0]).toBe(Category.STRAIGHT);
    expect(wheel[1]).toBe(5); // five-high
  });

  it("best of seven beats a lesser five", () => {
    // hole As Ks + board Qs Js Ts 2c 3d -> royal flush
    const seven = [card(14, 3), card(13, 3), card(12, 3), card(11, 3), card(10, 3), card(2, 0), card(3, 1)];
    const r = bestRankOfIndices(seven);
    expect(r[0]).toBe(Category.STRAIGHT_FLUSH);
    // a pair of aces is weaker
    const pairAces = bestRankOfIndices([card(14, 0), card(14, 1), card(9, 2), card(7, 3), card(4, 0)]);
    expect(compareRanks(r, pairAces)).toBeGreaterThan(0);
  });
});

describe("side pots", () => {
  it("an all-in short stack makes a side pot it cannot win", () => {
    // seat0 all-in 100, seat1 and seat2 each put 300. committed = [100,300,300], nobody folded
    const pots = buildPots([100, 300, 300], [false, false, false]);
    // main pot: 100*3 = 300, eligible {0,1,2}; side pot: 200*2 = 400, eligible {1,2}
    expect(pots).toHaveLength(2);
    expect(pots[0]).toEqual({ amount: 300, eligible: [0, 1, 2] });
    expect(pots[1]).toEqual({ amount: 400, eligible: [1, 2] });

    // seat0 has the best hand but is only eligible for the main pot
    const ranks: Record<number, number[]> = {
      0: [Category.QUADS, 14],
      1: [Category.PAIR, 10],
      2: [Category.HIGH, 9],
    };
    const won = awardPots(pots, (s) => ranks[s] ?? null, [0, 1, 2], 3);
    expect(won[0]).toBe(300); // wins main pot only
    expect(won[1]).toBe(400); // best among side-pot-eligible
    expect(won[2]).toBe(0);
  });

  it("splits a tied pot with odd chip to earliest in order", () => {
    const pots = buildPots([5, 5], [false, false]);
    const tie: Record<number, number[]> = { 0: [Category.PAIR, 10], 1: [Category.PAIR, 10] };
    const won = awardPots(pots, (s) => tie[s] ?? null, [0, 1], 2);
    expect(won[0]! + won[1]!).toBe(10);
    expect(won[0]).toBe(5);
    expect(won[1]).toBe(5);
    const odd = awardPots(buildPots([3, 4], [false, false]), (s) => tie[s] ?? null, [1, 0], 2);
    // pot = 7, tie -> 3 each, odd chip to seat1 (earliest in order [1,0])
    expect(odd[1]).toBe(4);
    expect(odd[0]).toBe(3);
  });
});

describe("betting round", () => {
  it("heads-up: bet, raise, call closes the street", () => {
    let s = startStreet({
      order: [0, 1],
      stack: [1000, 1000],
      folded: [false, false],
      allin: [false, false],
      bigBlind: 20,
      firstToActSeat: 0,
    });
    let r = applyBet(s, { seat: 0, type: "bet", to: 20 });
    expect(r.ok).toBe(true);
    r = applyBet(r.state, { seat: 1, type: "raise", to: 60 });
    expect(r.ok).toBe(true);
    r = applyBet(r.state, { seat: 0, type: "call" });
    expect(r.ok).toBe(true);
    expect(bettingComplete(r.state)).toBe(true);
    expect(r.state.committed).toEqual([60, 60]);
  });

  it("rejects an under-min raise and a check facing a bet", () => {
    let s = startStreet({ order: [0, 1], stack: [1000, 1000], folded: [false, false], allin: [false, false], bigBlind: 20, firstToActSeat: 0 });
    let r = applyBet(s, { seat: 0, type: "bet", to: 40 });
    expect(applyBet(r.state, { seat: 1, type: "raise", to: 50 }).ok).toBe(false); // increment 10 < 40
    expect(applyBet(r.state, { seat: 1, type: "check" }).ok).toBe(false);
    expect(applyBet(r.state, { seat: 1, type: "call" }).ok).toBe(true);
  });

  it("all-in for less than a call still closes when both act", () => {
    let s = startStreet({ order: [0, 1], stack: [50, 1000], folded: [false, false], allin: [false, false], bigBlind: 20, firstToActSeat: 0 });
    let r = applyBet(s, { seat: 0, type: "allin" }); // shoves 50
    expect(r.ok).toBe(true);
    expect(r.state.currentBet).toBe(50);
    r = applyBet(r.state, { seat: 1, type: "call" });
    expect(r.ok).toBe(true);
    expect(bettingComplete(r.state)).toBe(true);
    expect(contenders(r.state)).toEqual([0, 1]);
  });
});
