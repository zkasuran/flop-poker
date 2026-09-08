// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// Chips. In a hand they are authoritative: stacks in, bets out, pots awarded, all
// re-derivable from the transcript. Across tables a net-chip figure is a derived score, not
// a spendable balance a public log could keep double-spend-proof; real value rides a tclk
// stake gate per table. See ARENA.md for that boundary.

export interface HandChips {
  /** stacks at the start of the hand, by seat index. */
  start: number[];
  /** stacks at the end of the hand, by seat index. */
  end: number[];
}

/** Net chip change per seat over a hand. Sums to zero when no chips leak. */
export function netChange(chips: HandChips): number[] {
  return chips.start.map((s, i) => (chips.end[i] ?? 0) - s);
}

/** Fold a seat's signed hand results into a running net-chip leaderboard, keyed by did. */
export function tallyLeaderboard(entries: Array<{ did: string; net: number }>): Record<string, number> {
  const board: Record<string, number> = {};
  for (const e of entries) board[e.did] = (board[e.did] ?? 0) + e.net;
  return board;
}
