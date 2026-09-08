// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// A tournament coordinator, offline. Builds a bracket from the arena/1 helpers and prints the
// schedule. A live coordinator opens a table per pairing in the tournament room, reads each
// result, and advances; because results are re-derivable, the coordinator is untrusted.
// Run: node coordinator.mjs

import { advance, makeTourney, roundRobin, singleElimRound, standings } from "@flop-poker/arena";

const short = (d) => d.slice(-5);
const players = ["did:key:zAlice", "did:key:zBob", "did:key:zCara", "did:key:zDan", "did:key:zEve"];

const t = makeTourney({
  name: "Flop Poker Nightly",
  format: "poker-holdem",
  params: { buyIn: 1000, sb: 10, bb: 20 },
  gate: { kind: "open" },
  mode: "single-elim",
  room: "arena-t-demo",
  players,
  by: players[0],
  createdMs: 1_725_000_000_000,
});
console.log("tournament id:", t.id);
console.log("format:", t.format, "mode:", t.mode, "players:", players.length);

// single elimination; for the demo the first-listed player of each match wins
let field = players;
let round = 0;
while (field.length > 1) {
  const { matches, byes } = singleElimRound(field, round);
  console.log(
    `  round ${round}:`,
    matches.map((m) => `${short(m.a)} vs ${short(m.b)}`).join("  "),
    byes.length ? `(bye: ${short(byes[0])})` : "",
  );
  field = advance(matches, (m) => m.a, byes);
  round += 1;
}
console.log("  champion:", short(field[0]));

// a round-robin standings example
const rr = roundRobin(players.slice(0, 4));
const table = standings(rr, (m) => m.a);
console.log("round-robin over 4 players:", rr.length, "games; standings", Object.fromEntries(Object.entries(table).map(([d, w]) => [short(d), w])));
