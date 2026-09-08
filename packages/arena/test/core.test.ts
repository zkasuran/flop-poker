// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import {
  ARENA_PREFIX,
  canonicalJson,
  decodeFrame,
  encodeFrame,
  makeOpen,
  signingMessage,
  tableIdOf,
} from "../src/frames.js";
import {
  abbreviate,
  didFromPublicKey,
  generateIdentity,
  identityFromHexOrPassphrase,
  publicKeyFromDid,
  verify,
  tryVerify,
} from "../src/identity.js";
import { admit, passCommit } from "../src/gate.js";

describe("canonicalJson", () => {
  it("sorts keys, drops undefined, uses compact separators", () => {
    expect(canonicalJson({ b: 1, a: 2, c: undefined })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ z: [3, 2], a: true })).toBe('{"a":true,"z":[3,2]}');
  });
  it("escapes every non-ASCII code unit so stored bytes equal signed bytes", () => {
    expect(canonicalJson({ a: "é😀" })).toBe('{"a":"\\u00e9\\ud83d\\ude00"}');
  });
  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson({ a: Infinity })).toThrow();
  });
});

describe("did:key identity", () => {
  it("round-trips a public key through a did:key", () => {
    const id = generateIdentity();
    expect(id.did.startsWith("did:key:z6Mk")).toBe(true);
    expect(publicKeyFromDid(id.did)).toEqual(id.publicKey);
    expect(didFromPublicKey(id.publicKey)).toBe(id.did);
    expect(abbreviate(id.did)).toMatch(/^z6Mk….{4}$/);
  });
  it("signs and verifies, and a tampered message fails", () => {
    const id = generateIdentity();
    const msg = signingMessage("arena-lobby", "1725800000000", ARENA_PREFIX + '{"t":1}');
    const sig = id.sign(msg);
    expect(sig).toHaveLength(86);
    expect("AQgw").toContain(sig[85]);
    expect(tryVerify(id.did, sig, msg)).toBe(true);
    expect(tryVerify(id.did, sig, msg + "x")).toBe(false);
  });
  it("a passphrase seed is deterministic", () => {
    const a = identityFromHexOrPassphrase("correct horse battery staple");
    const b = identityFromHexOrPassphrase("correct horse battery staple");
    expect(a.did).toBe(b.did);
    expect(() => publicKeyFromDid("did:key:znotreal")).toThrow();
    expect(() => verify(a.did, "short", "m")).toThrow();
  });
});

describe("open frame + table id", () => {
  const id = generateIdentity();
  const open = makeOpen({
    from: id.did,
    format: "rps",
    params: { bestOf: 3 },
    gate: { kind: "open" },
    seats: { min: 2, max: 2 },
    nonce: "abc123",
  });

  it("computes an id that recomputes from the rest", () => {
    const { id: got, ...core } = open;
    expect(tableIdOf(core)).toBe(got);
  });
  it("round-trips through encode/decode", () => {
    const line = encodeFrame(open);
    expect(line.startsWith(ARENA_PREFIX)).toBe(true);
    expect(decodeFrame(line)).toEqual(open);
  });
  it("rejects a forged id, a non-arena line and a bad type", () => {
    const forged = encodeFrame({ ...open, id: ("0x" + "0".repeat(64)) as string });
    expect(decodeFrame(forged)).toBeNull();
    expect(decodeFrame("hello world")).toBeNull();
    expect(decodeFrame(ARENA_PREFIX + '{"type":"nope","from":"x","nonce":"1"}')).toBeNull();
  });
});

describe("gate", () => {
  const id = generateIdentity();
  const join = { type: "join" as const, from: id.did, table: "d-t", nonce: "n", proof: "hunter2" };

  it("open admits, full table rejects", () => {
    expect(admit({ kind: "open" }, join, { table: "d-t", seatsTaken: 0, seatsMax: 2 }).ok).toBe(true);
    expect(admit({ kind: "open" }, join, { table: "d-t", seatsTaken: 2, seatsMax: 2 }).ok).toBe(false);
  });
  it("allow list gates on the exact did", () => {
    expect(admit({ kind: "allow", dids: [id.did] }, join, { table: "d-t", seatsTaken: 0, seatsMax: 2 }).ok).toBe(true);
    expect(admit({ kind: "allow", dids: [] }, join, { table: "d-t", seatsTaken: 0, seatsMax: 2 }).ok).toBe(false);
  });
  it("pass gate checks the table-bound commitment", () => {
    const commit = passCommit("d-t", "hunter2");
    expect(admit({ kind: "pass", commit }, join, { table: "d-t", seatsTaken: 0, seatsMax: 2 }).ok).toBe(true);
    // same passcode, different table id -> different commit -> rejected
    expect(admit({ kind: "pass", commit }, { ...join, table: "d-other" }, { table: "d-other", seatsTaken: 0, seatsMax: 2 }).ok).toBe(false);
  });
});
