// SPDX-License-Identifier: Apache-2.0
//
// Poker hand evaluation: the best five-card hand out of five to seven cards, as a
// comparable rank vector [category, ...tiebreakers]. Card index 0..51 maps to rank 2..14
// (ace high) and one of four suits. The wheel A-2-3-4-5 is handled as a five-high straight.

export interface Card {
  rank: number; // 2..14 (ace high)
  suit: number; // 0..3
}

export const Category = {
  HIGH: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

export type HandRank = number[];

/** Card 0..51 -> {rank 2..14, suit 0..3}. rank = index%13 (0=2..12=ace), suit = index/13. */
export function cardFromIndex(index: number): Card {
  if (index < 0 || index > 51) throw new Error(`arena-poker: bad card index ${index}`);
  return { rank: (index % 13) + 2, suit: Math.floor(index / 13) };
}

const RANK_NAMES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUIT_NAMES = ["c", "d", "h", "s"];
export function cardName(index: number): string {
  const c = cardFromIndex(index);
  return `${RANK_NAMES[c.rank - 2]}${SUIT_NAMES[c.suit]}`;
}

/** True if `a` is the stronger hand. Lexicographic on the rank vectors. */
export function compareRanks(a: HandRank, b: HandRank): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function straightHigh(distinctDesc: number[]): number {
  // distinctDesc: unique ranks, descending. Returns the straight's high card, or 0.
  const s = distinctDesc.slice();
  if (s.includes(14)) s.push(1); // ace can be low for the wheel
  let run = 1;
  for (let i = 1; i < s.length; i += 1) {
    if (s[i]! === s[i - 1]! - 1) {
      run += 1;
      if (run >= 5) return s[i - 4]!;
    } else if (s[i]! !== s[i - 1]!) {
      run = 1;
    }
  }
  return 0;
}

/** Rank exactly five cards. */
export function rank5(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error("rank5 needs exactly 5 cards");
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = new Set(cards.map((c) => c.suit)).size === 1;
  const distinct = [...new Set(ranks)].sort((a, b) => b - a);
  const sHigh = straightHigh(distinct);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // groups sorted by count desc, then rank desc
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const g0 = groups[0]!;
  const g1 = groups[1];

  if (sHigh && flush) return [Category.STRAIGHT_FLUSH, sHigh];
  if (g0[1] === 4) {
    const kicker = groups.find((g) => g[1] === 1)![0];
    return [Category.QUADS, g0[0], kicker];
  }
  if (g0[1] === 3 && g1 && g1[1] >= 2) return [Category.FULL_HOUSE, g0[0], g1[0]];
  if (flush) return [Category.FLUSH, ...ranks];
  if (sHigh) return [Category.STRAIGHT, sHigh];
  if (g0[1] === 3) {
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]).sort((a, b) => b - a);
    return [Category.TRIPS, g0[0], ...kickers];
  }
  if (g0[1] === 2 && g1 && g1[1] === 2) {
    const hi = Math.max(g0[0], g1[0]);
    const lo = Math.min(g0[0], g1[0]);
    const kicker = groups.find((g) => g[1] === 1)![0];
    return [Category.TWO_PAIR, hi, lo, kicker];
  }
  if (g0[1] === 2) {
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]).sort((a, b) => b - a);
    return [Category.PAIR, g0[0], ...kickers];
  }
  return [Category.HIGH, ...ranks];
}

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  const n = arr.length;
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    yield idx.map((i) => arr[i]!);
    let i = k - 1;
    while (i >= 0 && idx[i]! === n - k + i) i -= 1;
    if (i < 0) return;
    idx[i]! += 1;
    for (let j = i + 1; j < k; j += 1) idx[j] = idx[j - 1]! + 1;
  }
}

/** Best five-card rank from five to seven cards. */
export function bestRank(cards: Card[]): HandRank {
  if (cards.length < 5) throw new Error("bestRank needs at least 5 cards");
  if (cards.length === 5) return rank5(cards);
  let best: HandRank | null = null;
  for (const combo of combinations(cards, 5)) {
    const r = rank5(combo);
    if (!best || compareRanks(r, best) > 0) best = r;
  }
  return best!;
}

/** Best rank from card indices (hole + community). */
export function bestRankOfIndices(indices: number[]): HandRank {
  return bestRank(indices.map(cardFromIndex));
}
