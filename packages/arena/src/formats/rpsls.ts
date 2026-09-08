// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// Rock Paper Scissors Lizard Spock: the five-move variant. Each move beats two others.

import { bestOf, makeSimultaneousFormat, targetForBestOf } from "./simultaneous.js";

// what each move beats
const BEATS: Record<string, string[]> = {
  rock: ["scissors", "lizard"],
  paper: ["rock", "spock"],
  scissors: ["paper", "lizard"],
  lizard: ["spock", "paper"],
  spock: ["scissors", "rock"],
};

export const rpsls = makeSimultaneousFormat({
  id: "rpsls",
  version: "1",
  skill: "skills/rpsls.skill.md",
  moves: ["rock", "paper", "scissors", "lizard", "spock"],
  seats: { min: 2, max: 2 },
  target: (p) => targetForBestOf(bestOf(p)),
  maxRounds: (p) => bestOf(p),
  scoreRound: (rev, seats) => {
    const a = rev[0];
    const b = rev[1];
    if (!a || !b || a.move === b.move) return [];
    if (BEATS[a.move]?.includes(b.move)) return [seats[0]!];
    if (BEATS[b.move]?.includes(a.move)) return [seats[1]!];
    return [];
  },
  rules: () => ({ beats: BEATS }),
});
