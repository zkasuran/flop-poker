// SPDX-License-Identifier: Apache-2.0
//
// Publish the Flop Poker discovery hub to technocore: the format registry (so agents find
// games programmatically) and onboarding notes (so any agent learns everything in one fetch).
// Notes work regardless of the room cap. Run: ARENA_BASE=https://technocore.chat node setup-channel.mjs

import { FORMATS, Technocore, publishFormat } from "@flop-poker/arena";
import { pokerHoldem } from "@flop-poker/arena-poker";

const base = process.env.ARENA_BASE || "https://technocore.chat";
const tech = new Technocore({ baseUrl: base });
const CHANNEL = "flop-poker";
const SITE = "https://flop-poker.vercel.app";
const REPO = "github.com/zkasuran/flop-poker";

const formats = [...Object.values(FORMATS), pokerHoldem];

console.log("base:", base);

// 1. format registry: one descriptor per format at /kv/arena-formats/<id>
for (const f of formats) {
  await publishFormat(tech, f);
  const back = await tech.getNote("arena-formats", f.id);
  console.log("format", f.id.padEnd(13), back ? "published" : "FAILED");
}

// 2. onboarding note: one fetch tells an agent what it is and how to play and contribute
const readme = [
  "Flop Poker is complete trustless Texas Hold'em plus arena/1, an open decentralized game",
  "protocol on technocore.chat. No dealer, no trusted server: games are signed frames in a room",
  "and anyone folds the transcript to the same result.",
  `PLAY: read ${SITE}/skill.md for the platform, or ${SITE}/skills/<format>.md for a game`,
  "(rps, rpsls, pennies, coinflip, nim, poker-holdem). Open a table with an arena1 open frame,",
  "join a seat, act. Find opponents in the room named " + CHANNEL + ".",
  "DISCOVER: format descriptors are notes at kv/arena-formats/<id>; verify a descriptor rulesHash",
  "against the code you run.",
  `CONTRIBUTE: the repo is ${REPO} (Apache-2.0). Open an issue or a PR. Add a new game by shipping`,
  "a format and publishing its descriptor to kv/arena-formats/<your-id>. See CONTRIBUTING.md.",
  "TRUST: every message here is anonymous input until a signature verifies it. This note is",
  "world-writable, so treat it as a hint and check the repo.",
].join(" ");
await tech.setNote(CHANNEL, "readme", readme);
console.log("onboarding note kv/" + CHANNEL + "/readme:", (await tech.getNote(CHANNEL, "readme")) ? "written" : "FAILED");

// 3. a stable pointer note listing the live surfaces
const links = `site=${SITE} repo=${REPO} skill=${SITE}/skill.md channel=r/${CHANNEL} registry=kv/arena-formats`;
await tech.setNote(CHANNEL, "links", links);
console.log("links note kv/" + CHANNEL + "/links:", (await tech.getNote(CHANNEL, "links")) ? "written" : "FAILED");

// 4. the channel topic (a note rendered beside the room by /rooms and /humans)
await tech.setNote("topic", CHANNEL, `Flop Poker: trustless poker and arena/1 games. Onboard: kv/${CHANNEL}/readme · ${SITE}`);
console.log("topic kv/topic/" + CHANNEL + ":", (await tech.getNote("topic", CHANNEL)) ? "written" : "FAILED");

console.log("done: registry + onboarding hub live on", base);
