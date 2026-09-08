// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { describe, expect, it } from "vitest";

import { cardIndexOf, cardPoint, cardPoints, G, randomScalar } from "../src/group.js";
import { cipherEquals, mask, remask, trivial } from "../src/elgamal.js";
import {
  aggregate,
  combineUnmask,
  keygen,
  proveKey,
  unmaskShare,
  unmaskShareD,
  verifyKeyProof,
  verifyUnmaskShare,
} from "../src/vtmf.js";
import { proveShuffle, shuffle, verifyShuffle } from "../src/shuffle.js";

describe("VTMF keygen + proof of knowledge", () => {
  it("verifies an honest key proof and rejects a tampered one", () => {
    const share = keygen();
    const proof = proveKey(share, "table|hand|seat0");
    expect(verifyKeyProof(proof, "table|hand|seat0")).toBe(true);
    // wrong label (replay into another game) fails
    expect(verifyKeyProof(proof, "table|hand|seat1")).toBe(false);
    // tampered response fails
    expect(verifyKeyProof({ ...proof, z: proof.a }, "table|hand|seat0")).toBe(false);
  });
});

describe("threshold unmask round-trip", () => {
  it("two seats mask a card and cooperatively recover it", () => {
    const s0 = keygen();
    const s1 = keygen();
    const pk = aggregate([s0.pk, s1.pk]);
    const card = cardPoint(23);
    const ct = mask(pk, card, randomScalar());

    const label = "t|h|c";
    const u0 = unmaskShare(s0, ct, label);
    const u1 = unmaskShare(s1, ct, label);
    expect(verifyUnmaskShare(u0, ct, s0.pk, label)).toBe(true);
    expect(verifyUnmaskShare(u1, ct, s1.pk, label)).toBe(true);
    // a share checked against the wrong seat's key fails
    expect(verifyUnmaskShare(u0, ct, s1.pk, label)).toBe(false);

    const recovered = combineUnmask(ct, [unmaskShareD(u0), unmaskShareD(u1)]);
    expect(cardIndexOf(recovered)).toBe(23);
  });

  it("hole-card secrecy: a non-holder cannot recover the card", () => {
    const s0 = keygen(); // holder
    const s1 = keygen(); // contributor
    const pk = aggregate([s0.pk, s1.pk]);
    const card = cardPoint(41);
    const ct = mask(pk, card, randomScalar());
    const label = "t|h|hole0";

    // Deal-to-seat0: everyone else (s1) contributes; s1 alone cannot see the card.
    const u1 = unmaskShare(s1, ct, label);
    const seenByS1 = combineUnmask(ct, [unmaskShareD(u1)]);
    expect(cardIndexOf(seenByS1)).toBe(-1); // not a card point -> nothing learned

    // The holder finishes with its own share and learns the card.
    const u0 = unmaskShare(s0, ct, label);
    const seenByHolder = combineUnmask(ct, [unmaskShareD(u1), unmaskShareD(u0)]);
    expect(cardIndexOf(seenByHolder)).toBe(41);
  });
});

describe("verifiable shuffle (cut-and-choose)", () => {
  const s0 = keygen();
  const s1 = keygen();
  const pk = aggregate([s0.pk, s1.pk]);
  const deck = cardPoints().map((m) => trivial(m));

  it("an honest shuffle verifies", () => {
    const { output, secret } = shuffle(pk, deck);
    const proof = proveShuffle(pk, deck, output, secret, 16);
    expect(verifyShuffle(pk, deck, output, proof)).toBe(true);
    // the output really is a remasking (not equal to the input order in general)
    expect(output.length).toBe(52);
  });

  it("a substituted card is caught", () => {
    const { output, secret } = shuffle(pk, deck);
    const proof = proveShuffle(pk, deck, output, secret, 16);
    // tamper: replace one output ciphertext with something not in the deck
    const tampered = output.slice();
    tampered[0] = { c1: output[0]!.c1, c2: output[0]!.c2.add(G) };
    expect(verifyShuffle(pk, deck, tampered, proof)).toBe(false);
  });

  it("composed shuffles by both seats remain a permutation of the deck", () => {
    const a = shuffle(pk, deck);
    const b = shuffle(pk, a.output);
    const pa = proveShuffle(pk, deck, a.output, a.secret, 12);
    const pb = proveShuffle(pk, a.output, b.output, b.secret, 12);
    expect(verifyShuffle(pk, deck, a.output, pa)).toBe(true);
    expect(verifyShuffle(pk, a.output, b.output, pb)).toBe(true);
    // sanity: nothing collapsed to equal ciphertexts
    expect(cipherEquals(b.output[0]!, deck[0]!)).toBe(false);
  });
});
