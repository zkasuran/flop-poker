// SPDX-License-Identifier: Apache-2.0
//
// Side-pot construction and award. Every chip a player commits over a hand goes into a
// layered set of pots: a player is eligible for a layer only up to what they put in, so an
// all-in for less than the bet creates a side pot the short stack cannot win. Folded money
// stays in the pots as dead money but folded players win nothing. Odd chips left after an
// even split go to the earliest eligible winner in table order.

import { compareRanks, type HandRank } from "./handeval.js";

export interface Pot {
  amount: number;
  eligible: number[]; // seat indices that can win this pot
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/** Build main + side pots from each seat's total committed over the hand and folded flags. */
export function buildPots(committed: number[], folded: boolean[]): Pot[] {
  const n = committed.length;
  const levels = [...new Set(committed.filter((c) => c > 0))].sort((a, b) => a - b);
  const raw: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let count = 0;
    for (let s = 0; s < n; s += 1) if ((committed[s] ?? 0) >= level) count += 1;
    const amount = (level - prev) * count;
    const eligible: number[] = [];
    for (let s = 0; s < n; s += 1) if ((committed[s] ?? 0) >= level && !folded[s]) eligible.push(s);
    if (amount > 0) raw.push({ amount, eligible });
    prev = level;
  }
  // merge adjacent layers with identical eligibility
  const merged: Pot[] = [];
  for (const p of raw) {
    const last = merged[merged.length - 1];
    if (last && sameSet(last.eligible, p.eligible)) last.amount += p.amount;
    else merged.push({ amount: p.amount, eligible: p.eligible.slice() });
  }
  return merged;
}

/**
 * Award every pot. `rankOf` returns a seat's best hand rank at showdown, or null if it did
 * not reach showdown (folded). `order` is table order from the button for the odd-chip rule.
 * Returns chips won per seat index.
 */
export function awardPots(
  pots: Pot[],
  rankOf: (seat: number) => HandRank | null,
  order: number[],
  seatCount: number,
): number[] {
  const won = new Array<number>(seatCount).fill(0);
  for (const pot of pots) {
    const contenders = pot.eligible.filter((s) => rankOf(s) !== null);
    if (contenders.length === 0) continue;
    let best: HandRank | null = null;
    for (const s of contenders) {
      const r = rankOf(s)!;
      if (!best || compareRanks(r, best) > 0) best = r;
    }
    const winners = contenders.filter((s) => compareRanks(rankOf(s)!, best!) === 0);
    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;
    for (const s of winners) won[s] = (won[s] ?? 0) + share;
    // odd chips to earliest winners in table order
    const byOrder = order.filter((s) => winners.includes(s));
    for (let i = 0; i < remainder; i += 1) {
      const s = byOrder[i % byOrder.length]!;
      won[s] = (won[s] ?? 0) + 1;
    }
  }
  return won;
}
