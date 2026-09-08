// SPDX-License-Identifier: Apache-2.0
//
// Coin flip: a fair 50/50 from a commit-reveal randomness beacon, no skill. Both players
// commit a random salt, then reveal; the coin is a hash of both salts, so neither can
// bias it as long as one commits honestly before seeing the other. Seat 0 calls heads.
// The same construction seeds any game that needs shared randomness (dice, deal order).

import { sha256Hex } from "../bytes.js";
import { makeSimultaneousFormat } from "./simultaneous.js";

export const coinflip = makeSimultaneousFormat({
  id: "coinflip",
  version: "1",
  skill: "skills/coinflip.skill.md",
  moves: ["flip"],
  seats: { min: 2, max: 2 },
  target: () => 1,
  maxRounds: () => 1,
  scoreRound: (rev, seats) => {
    const a = rev[0];
    const b = rev[1];
    if (!a || !b) return [];
    const beacon = sha256Hex(`${seats[0]}:${a.salt}|${seats[1]}:${b.salt}`);
    const heads = (parseInt(beacon.slice(-1), 16) & 1) === 0;
    return heads ? [seats[0]!] : [seats[1]!];
  },
  rules: () => ({ beacon: "sha256(seat0:salt0|seat1:salt1)", seat0: "heads" }),
});
