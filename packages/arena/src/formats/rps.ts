// SPDX-License-Identifier: Apache-2.0
//
// Rock Paper Scissors: the reference commit-reveal game. Two players, best-of-N.

import { bestOf, makeSimultaneousFormat, targetForBestOf } from "./simultaneous.js";

const BEATS: Record<string, string> = { rock: "scissors", paper: "rock", scissors: "paper" };

export const rps = makeSimultaneousFormat({
  id: "rps",
  version: "1",
  skill: "skills/rps.skill.md",
  moves: ["rock", "paper", "scissors"],
  seats: { min: 2, max: 2 },
  target: (p) => targetForBestOf(bestOf(p)),
  maxRounds: (p) => bestOf(p),
  scoreRound: (rev, seats) => {
    const a = rev[0];
    const b = rev[1];
    if (!a || !b || a.move === b.move) return [];
    return BEATS[a.move] === b.move ? [seats[0]!] : [seats[1]!];
  },
  rules: () => ({ beats: BEATS }),
});
