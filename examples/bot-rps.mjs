// SPDX-License-Identifier: Apache-2.0
//
// A live Rock Paper Scissors match over a technocore instance, both sides in one process, to
// show the real transport end to end. It opens a table, joins two identities, plays a
// best-of-3, reads the room back, folds it to a result, then re-verifies the whole match from
// the byte-exact /export dump.
//
// Run against a local technocore (new-room creation works there):
//   CHAT_ROOT=./data uv run uvicorn --app-dir src app:app --port 8080   # in technocore-chat
//   ARENA_BASE=http://localhost:8080 node bot-rps.mjs
// The public technocore.chat is usually at its room cap, so a fresh room there will 400.

import {
  Technocore,
  encodeFrame,
  foldTable,
  generateIdentity,
  makeAct,
  makeJoin,
  makeOpen,
  makeStart,
  moveCommit,
  randomHex32,
  rps,
  tableRef,
} from "@flop-poker/arena";

const base = process.env.ARENA_BASE || "http://localhost:8080";
const room = process.env.ARENA_ROOM || "arena-rps-" + randomHex32().slice(2, 10);
const tech = new Technocore({ baseUrl: base });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const alice = generateIdentity();
const bob = generateIdentity();
const open = makeOpen({ from: alice.did, format: "rps", params: { bestOf: 3 }, gate: { kind: "open" }, seats: { min: 2, max: 2 } });
const ref = tableRef(open);

const post = async (id, frame) => {
  const w = await tech.saySigned(room, id, encodeFrame(frame));
  if (!w.ok) throw new Error(`write failed ${w.status}: ${w.body.slice(0, 120)}`);
  await sleep(120);
};

const roundActs = async (id, round, move) => {
  const salt = randomHex32();
  await post(id, makeAct(open, id.did, { step: "commit", data: moveCommit(ref, 0, round, id.did, move, salt) }));
  return { id, move, salt };
};

console.log("base:", base, "room:", room);
await post(alice, open);
await post(alice, makeJoin(open, alice.did));
await post(bob, makeJoin(open, bob.did));
await post(alice, makeStart(open, alice.did, [alice.did, bob.did]));

const script = [
  ["rock", "scissors"],
  ["paper", "rock"],
];
for (let round = 0; round < script.length; round += 1) {
  const [am, bm] = script[round];
  const a = await roundActs(alice, round, am);
  const b = await roundActs(bob, round, bm);
  await post(a.id, makeAct(open, alice.did, { step: "reveal", data: { move: a.move, salt: a.salt } }));
  await post(b.id, makeAct(open, bob.did, { step: "reveal", data: { move: b.move, salt: b.salt } }));
}

await sleep(400);
const live = foldTable(room, open, rps, (await tech.read(room, { limit: 200 })).messages);
console.log("live fold  -> phase", live.phase, "winner", live.outcome?.winners?.[0] === alice.did ? "alice" : live.outcome?.winners?.[0] === bob.did ? "bob" : live.outcome?.winners);

const exported = foldTable(room, open, rps, await tech.exportRoom(room));
console.log("export fold-> phase", exported.phase, "scores", exported.outcome?.scores);
console.log("winner is alice (rock,paper vs scissors,rock):", exported.outcome?.winners?.[0] === alice.did);
