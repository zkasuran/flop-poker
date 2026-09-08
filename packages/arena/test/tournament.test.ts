// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { describe, expect, it } from "vitest";

import { generateIdentity } from "../src/identity.js";
import {
  advance,
  makeTourney,
  roundRobin,
  signFeatured,
  singleElimRound,
  standings,
  verifyFeatured,
  type Match,
} from "../src/tournament.js";

const players = ["did:key:zA", "did:key:zB", "did:key:zC", "did:key:zD"];

describe("brackets", () => {
  it("round-robin yields every pair once", () => {
    expect(roundRobin(players)).toHaveLength(6);
  });

  it("single-elim pairs in order and byes the odd one out", () => {
    const even = singleElimRound(players, 0);
    expect(even.matches).toHaveLength(2);
    expect(even.byes).toHaveLength(0);
    const odd = singleElimRound([...players, "did:key:zE"], 0);
    expect(odd.matches).toHaveLength(2);
    expect(odd.byes).toEqual(["did:key:zE"]);
  });

  it("advances winners plus byes", () => {
    const { matches, byes } = singleElimRound([...players, "did:key:zE"], 0);
    const winnerOf = (m: Match) => m.a; // a always wins
    const next = advance(matches, winnerOf, byes);
    expect(next).toEqual(["did:key:zA", "did:key:zC", "did:key:zE"]);
  });

  it("standings count wins", () => {
    const ms = roundRobin(players);
    const table = standings(ms, (m) => m.a);
    expect(table["did:key:zA"]).toBe(3); // A beats B, C, D
    expect(table["did:key:zD"]).toBe(0);
  });
});

describe("tournament identity", () => {
  it("id is deterministic over the config", () => {
    const cfg = {
      name: "Flop Poker Nightly",
      format: "poker-holdem",
      params: { buyIn: 1000 },
      gate: { kind: "open" as const },
      mode: "single-elim" as const,
      room: "arena-lobby",
      players,
      by: players[0]!,
      createdMs: 1_725_000_000_000,
    };
    expect(makeTourney(cfg).id).toBe(makeTourney(cfg).id);
  });
});

describe("featured (flagship) list", () => {
  it("verifies against the curator DID and rejects forgery/tamper", () => {
    const curator = generateIdentity();
    const other = generateIdentity();
    const featured = { tourneys: ["0xabc", "0xdef"], issuedMs: 1_725_000_000_000 };
    const value = signFeatured(curator, featured);

    expect(verifyFeatured(value, curator.did)?.tourneys).toEqual(["0xabc", "0xdef"]);
    // wrong curator
    expect(verifyFeatured(value, other.did)).toBeNull();
    // tampered list
    const tampered = value.replace("0xabc", "0x666");
    expect(verifyFeatured(tampered, curator.did)).toBeNull();
  });
});
