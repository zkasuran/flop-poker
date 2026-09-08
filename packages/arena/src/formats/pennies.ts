// SPDX-License-Identifier: Apache-2.0
//
// Matching pennies: a zero-sum simultaneous game. Seat 0 is the matcher and wins the
// round when both show the same face; seat 1 is the mismatcher and wins when they differ.

import { bestOf, makeSimultaneousFormat, targetForBestOf } from "./simultaneous.js";

export const pennies = makeSimultaneousFormat({
  id: "pennies",
  version: "1",
  skill: "skills/pennies.skill.md",
  moves: ["heads", "tails"],
  seats: { min: 2, max: 2 },
  target: (p) => targetForBestOf(bestOf(p)),
  maxRounds: (p) => bestOf(p),
  scoreRound: (rev, seats) => {
    const a = rev[0];
    const b = rev[1];
    if (!a || !b) return [];
    return a.move === b.move ? [seats[0]!] : [seats[1]!];
  },
  rules: () => ({ matcher: "seat0", mismatcher: "seat1" }),
});
