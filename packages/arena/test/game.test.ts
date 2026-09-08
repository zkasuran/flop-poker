// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { describe, expect, it } from "vitest";

import { randomHex32 } from "../src/bytes.js";
import { generateIdentity } from "../src/identity.js";
import type { Identity } from "../src/identity.js";
import {
  encodeFrame,
  makeAct,
  makeJoin,
  makeOpen,
  makeStart,
  signingMessage,
  tableRef,
} from "../src/frames.js";
import type { ArenaFrame, OpenFrame } from "../src/frames.js";
import { foldTable } from "../src/machine.js";
import type { Record } from "../src/transport.js";
import { coinflip, moveCommit, nim, pennies, rps } from "../src/formats/index.js";
import type { Format } from "../src/format.js";

const ROOM = "arena-lobby";

function rec(id: Identity, frame: ArenaFrame, seq: number): Record {
  const text = encodeFrame(frame);
  const nonce = String(1_700_000_000_000 + seq);
  return {
    seq,
    ts: new Date().toISOString(),
    from: id.did,
    text,
    nonce,
    sig: id.sign(signingMessage(ROOM, nonce, text)),
  };
}

/** commit + reveal acts for one seat in one round of a simultaneous format. */
function roundActs(
  open: OpenFrame,
  id: Identity,
  round: number,
  move: string,
): { commit: ArenaFrame; reveal: ArenaFrame } {
  const salt = randomHex32();
  const commit = moveCommit(tableRef(open), 0, round, id.did, move, salt);
  return {
    commit: makeAct(open, id.did, { step: "commit", data: commit }),
    reveal: makeAct(open, id.did, { step: "reveal", data: { move, salt } }),
  };
}

describe("full RPS match through the machine", () => {
  const p0 = generateIdentity();
  const p1 = generateIdentity();
  const open = makeOpen({
    from: p0.did,
    format: "rps",
    params: { bestOf: 3 },
    gate: { kind: "open" },
    seats: { min: 2, max: 2 },
  });

  it("plays best-of-3, p0 (rock) beats p1 (scissors) 2-0", () => {
    const records: Record[] = [];
    let seq = 0;
    const push = (id: Identity, f: ArenaFrame) => records.push(rec(id, f, seq++));

    push(p0, open);
    push(p0, makeJoin(open, p0.did));
    push(p1, makeJoin(open, p1.did));
    push(p0, makeStart(open, p0.did, [p0.did, p1.did]));
    for (const round of [0, 1]) {
      const a = roundActs(open, p0, round, "rock");
      const b = roundActs(open, p1, round, "scissors");
      push(p0, a.commit);
      push(p1, b.commit);
      push(p0, a.reveal);
      push(p1, b.reveal);
    }

    const t = foldTable(ROOM, open, rps, records);
    expect(t.phase).toBe("done");
    expect(t.outcome?.winners).toEqual([p0.did]);
    expect(t.outcome?.scores).toEqual({ [p0.did]: 2, [p1.did]: 0 });
  });

  it("rejects a reveal whose salt does not match the commitment", () => {
    const records: Record[] = [];
    let seq = 0;
    const push = (id: Identity, f: ArenaFrame) => records.push(rec(id, f, seq++));
    push(p0, open);
    push(p0, makeJoin(open, p0.did));
    push(p1, makeJoin(open, p1.did));
    push(p0, makeStart(open, p0.did, [p0.did, p1.did]));
    const a = roundActs(open, p0, 0, "rock");
    push(p0, a.commit);
    // p0 tries to reveal a different move than committed
    push(p0, makeAct(open, p0.did, { step: "reveal", data: { move: "paper", salt: randomHex32() } }));

    const t = foldTable(ROOM, open, rps, records);
    // still seating? no — started; the bad reveal was ignored, so round 0 has 1 commit, 0 reveals
    expect(t.phase).toBe("playing");
    expect(t.outcome).toBeNull();
  });

  it("ignores an act from a non-seated key", () => {
    const stranger = generateIdentity();
    const records: Record[] = [];
    let seq = 0;
    const push = (id: Identity, f: ArenaFrame) => records.push(rec(id, f, seq++));
    push(p0, open);
    push(p0, makeJoin(open, p0.did));
    push(p1, makeJoin(open, p1.did));
    push(p0, makeStart(open, p0.did, [p0.did, p1.did]));
    // stranger commits — should be dropped (verifyRecord passes, but not a seat)
    const salt = randomHex32();
    const commit = moveCommit(tableRef(open), 0, 0, stranger.did, "rock", salt);
    push(stranger, makeAct(open, stranger.did, { step: "commit", data: commit }));
    const t = foldTable(ROOM, open, rps, records);
    expect(t.phase).toBe("playing");
  });
});

describe("other simultaneous formats", () => {
  const p0 = generateIdentity();
  const p1 = generateIdentity();

  function play<S>(format: Format<S>, params: object, m0: string, m1: string) {
    const open = makeOpen({
      from: p0.did,
      format: format.id,
      params: params as never,
      gate: { kind: "open" },
      seats: { min: 2, max: 2 },
    });
    const records: Record[] = [];
    let seq = 0;
    const push = (id: Identity, f: ArenaFrame) => records.push(rec(id, f, seq++));
    push(p0, open);
    push(p0, makeJoin(open, p0.did));
    push(p1, makeJoin(open, p1.did));
    push(p0, makeStart(open, p0.did, [p0.did, p1.did]));
    const a = roundActs(open, p0, 0, m0);
    const b = roundActs(open, p1, 0, m1);
    push(p0, a.commit);
    push(p1, b.commit);
    push(p0, a.reveal);
    push(p1, b.reveal);
    return { open, state: foldTable(ROOM, open, format, records), p0: p0.did, p1: p1.did };
  }

  it("pennies: matcher (seat0) wins on equal faces", () => {
    const r = play(pennies, { bestOf: 1 }, "heads", "heads");
    expect(r.state.phase).toBe("done");
    expect(r.state.outcome?.winners).toEqual([r.p0]);
  });

  it("pennies: mismatcher (seat1) wins on different faces", () => {
    const r = play(pennies, { bestOf: 1 }, "heads", "tails");
    expect(r.state.outcome?.winners).toEqual([r.p1]);
  });

  it("coinflip: produces exactly one winner deterministically from the salts", () => {
    const r = play(coinflip, {}, "flip", "flip");
    expect(r.state.phase).toBe("done");
    expect(r.state.outcome?.winners).toHaveLength(1);
  });
});

describe("nim (sequential)", () => {
  const p0 = generateIdentity();
  const p1 = generateIdentity();

  it("normal play: taker of the last object wins", () => {
    const open = makeOpen({
      from: p0.did,
      format: "nim",
      params: { heaps: [1, 1] },
      gate: { kind: "open" },
      seats: { min: 2, max: 2 },
    });
    const records: Record[] = [];
    let seq = 0;
    const push = (id: Identity, f: ArenaFrame) => records.push(rec(id, f, seq++));
    push(p0, open);
    push(p0, makeJoin(open, p0.did));
    push(p1, makeJoin(open, p1.did));
    push(p0, makeStart(open, p0.did, [p0.did, p1.did]));
    // heaps [1,1]: p0 takes heap0, p1 takes heap1 (last) -> p1 wins
    push(p0, makeAct(open, p0.did, { step: "move", data: { heap: 0, count: 1 } }));
    push(p1, makeAct(open, p1.did, { step: "move", data: { heap: 1, count: 1 } }));
    const t = foldTable(ROOM, open, nim, records);
    expect(t.phase).toBe("done");
    expect(t.outcome?.winners).toEqual([p1.did]);
  });
});
