// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// A complete trustless Hold'em hand, headless, with real crypto. Run: node poker-selfplay.mjs
// One process plays every seat (holds every key), so it can print every hand. Real play
// spreads the keys across agents; the protocol is identical.

import {
  applyStep,
  bestRankOfIndices,
  cardName,
  cipherFromWire,
  handComplete,
  initHand,
  newSeatSecret,
  proveKey,
  seatShuffle,
  unmaskShare,
} from "@flop-poker/arena-poker";

const N = 3;
const holePos = (s) => [s, s + N];
const must = (r) => {
  if (!r.ok) throw new Error("rejected: " + r.reason);
  return r.state;
};

const cfg = { seats: ["s0", "s1", "s2"], stacks: [100, 500, 500], button: 0, sb: 10, bb: 20, label: "selfplay|h0" };
const secrets = cfg.seats.map(() => newSeatSecret());
let state = initHand(cfg);

for (let s = 0; s < N; s++) state = must(applyStep(state, { kind: "key", seat: s, proof: proveKey(secrets[s].share, `${cfg.label}|key${s}`) }));
for (let s = 0; s < N; s++) {
  const { deck, proof } = seatShuffle(state.aggKeyB64, state.deck, 8);
  state = must(applyStep(state, { kind: "shuffle", seat: s, deck, proof }));
}
const deck = state.deck;
const share = (seat, pos) => unmaskShare(secrets[seat].share, cipherFromWire(deck[pos]), `${cfg.label}|pos${pos}`);
const unmask = (seat, pos) => ({ kind: "unmask", seat, pos, share: share(seat, pos) });

for (let s = 0; s < N; s++) for (const pos of holePos(s)) for (let c = 0; c < N; c++) if (c !== s) state = must(applyStep(state, unmask(c, pos)));

const base = 2 * N;
const streetNeeds = { flop: [base, base + 1, base + 2], turn: [base + 3], river: [base + 4] };
const plan = {
  preflop: [{ seat: 0, type: "allin" }, { seat: 1, type: "call" }, { seat: 2, type: "call" }],
  flop: [{ seat: 1, type: "bet", to: 200 }, { seat: 2, type: "call" }],
  turn: [{ seat: 1, type: "check" }, { seat: 2, type: "check" }],
  river: [{ seat: 1, type: "check" }, { seat: 2, type: "check" }],
};
for (const st of ["preflop", "flop", "turn", "river"]) {
  if (handComplete(state)) break;
  if (st !== "preflop" && state.phase === st) for (const pos of streetNeeds[st]) for (let c = 0; c < N; c++) if (!state.shares.get(pos)?.has(c)) state = must(applyStep(state, unmask(c, pos)));
  if (state.phase === st && state.street) for (const a of plan[st]) if (state.street) state = must(applyStep(state, { kind: "bet", seat: a.seat, action: a }));
}
if (state.phase === "showdown") for (let s = 0; s < N; s++) if (!state.folded[s]) for (const pos of holePos(s)) state = must(applyStep(state, { kind: "reveal", seat: s, pos, share: share(s, pos) }));

const board = state.community.map(cardName).join(" ");
console.log("community:", board);
for (let s = 0; s < N; s++) {
  const hole = state.holeCards[s];
  const cards = hole ? hole.map(cardName).join(" ") : "(folded/hidden)";
  const net = (state.payouts?.[s] ?? state.stacks[s]) - cfg.stacks[s];
  console.log(`seat ${s}: ${cards.padEnd(8)}  net ${net >= 0 ? "+" : ""}${net}`);
}
console.log("complete:", handComplete(state), "chips conserved:", state.payouts.reduce((a, b) => a + b, 0) === cfg.stacks.reduce((a, b) => a + b, 0));
