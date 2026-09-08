// SPDX-License-Identifier: Apache-2.0
//
// Verifiable shuffle by cut-and-choose. A shuffler permutes the deck and remasks every
// card, then proves the output is a permutation-and-remask of the input without revealing
// the permutation. This is what stops a shuffler substituting or duplicating a card while
// the remask hides which card moved where.
//
// The argument, t rounds: the shuffler publishes t auxiliary shuffles B_j of the input. A
// Fiat-Shamir bit per round then forces the shuffler to reveal EITHER how B_j came from the
// input OR how B_j came from the output. Both are answerable only if the output really is a
// shuffle of the input; a cheat can answer at most one side per round, so it is caught with
// probability 1 - 2^-t. The unopened side stays hidden, which is what keeps it zero
// knowledge. Complete and sound: t is a security parameter, not a reduced mode. Bayer-Groth
// is a later drop-in for smaller proofs behind this same interface.

import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { mod, ORDER, randomScalar, scalarFromB64, scalarToB64, type Pt } from "./group.js";
import { cipherFromWire, cipherToWire, remask, type Cipher, type CipherWire } from "./elgamal.js";

export type Deck = Cipher[];
export const DEFAULT_ROUNDS = 64; // 2^-64 soundness

export interface ShuffleSecret {
  perm: number[]; // out[i] = remask(in[perm[i]])
  rand: bigint[];
}

export interface ShuffleProofWire {
  rounds: number;
  aux: CipherWire[][];
  openings: { perm: number[]; rand: string[] }[];
}

function randInt(n: number): number {
  // uniform in [0, n) via rejection on a scalar draw
  if (n <= 0) throw new Error("randInt: n must be positive");
  const limit = ORDER - (ORDER % BigInt(n));
  for (;;) {
    const s = randomScalar();
    if (s < limit) return Number(s % BigInt(n));
  }
}

export function randomPermutation(n: number): number[] {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = randInt(i + 1);
    const tmp = p[i]!;
    p[i] = p[j]!;
    p[j] = tmp;
  }
  return p;
}

function isPermutation(p: number[], n: number): boolean {
  if (p.length !== n) return false;
  const seen = new Array<boolean>(n).fill(false);
  for (const v of p) {
    if (!Number.isInteger(v) || v < 0 || v >= n || seen[v]) return false;
    seen[v] = true;
  }
  return true;
}

function applyShuffle(pk: Pt, deck: Deck, perm: number[], rand: bigint[]): Deck {
  return perm.map((src, i) => remask(pk, deck[src]!, rand[i]!));
}

/** Permute and remask a deck, returning the output and the secret linking it to the input. */
export function shuffle(pk: Pt, deck: Deck): { output: Deck; secret: ShuffleSecret } {
  const n = deck.length;
  const perm = randomPermutation(n);
  const rand = Array.from({ length: n }, () => randomScalar());
  return { output: applyShuffle(pk, deck, perm, rand), secret: { perm, rand } };
}

function inverse(perm: number[]): number[] {
  const inv = new Array<number>(perm.length);
  perm.forEach((src, i) => {
    inv[src] = i;
  });
  return inv;
}

function deckBytes(deck: Deck): Uint8Array {
  return concatBytes(...deck.flatMap((c) => [c.c1.toBytes(), c.c2.toBytes()]));
}

/** Deterministic challenge bits from the whole transcript (Fiat-Shamir). */
function challengeBits(pk: Pt, input: Deck, output: Deck, aux: Deck[], rounds: number): boolean[] {
  const digest = sha256(
    concatBytes(pk.toBytes(), deckBytes(input), deckBytes(output), ...aux.map(deckBytes)),
  );
  const bits: boolean[] = [];
  for (let j = 0; j < rounds; j += 1) {
    const byte = digest[Math.floor(j / 8) % digest.length]!;
    bits.push(((byte >> (j % 8)) & 1) === 1);
  }
  return bits;
}

/**
 * Prove `output` is a permutation-and-remask of `input` under `pk`, with `secret` the link
 * between them. Returns a serializable proof. Large by design; carry it on the blob layer.
 */
export function proveShuffle(
  pk: Pt,
  input: Deck,
  output: Deck,
  secret: ShuffleSecret,
  rounds: number = DEFAULT_ROUNDS,
): ShuffleProofWire {
  const n = input.length;
  const piInv = inverse(secret.perm); // old index -> new index (D -> D')
  const auxPerms: number[][] = [];
  const auxRands: bigint[][] = [];
  const aux: Deck[] = [];
  for (let j = 0; j < rounds; j += 1) {
    const sPerm = randomPermutation(n);
    const sRand = Array.from({ length: n }, () => randomScalar());
    auxPerms.push(sPerm);
    auxRands.push(sRand);
    aux.push(applyShuffle(pk, input, sPerm, sRand));
  }
  const bits = challengeBits(pk, input, output, aux, rounds);
  const openings = bits.map((bit, j) => {
    const sPerm = auxPerms[j]!;
    const sRand = auxRands[j]!;
    if (!bit) {
      // reveal input -> B_j
      return { perm: sPerm, rand: sRand.map(scalarToB64) };
    }
    // reveal output -> B_j: tau(i) = piInv[sPerm[i]], rho'(i) = sRand[i] - secret.rand[tau(i)]
    const tau = sPerm.map((src) => piInv[src]!);
    const rho = tau.map((t, i) => mod(sRand[i]! - secret.rand[t]!));
    return { perm: tau, rand: rho.map(scalarToB64) };
  });
  return { rounds, aux: aux.map((d) => d.map(cipherToWire)), openings };
}

/** Verify a shuffle proof. True only if every opened round checks against its base deck. */
export function verifyShuffle(pk: Pt, input: Deck, output: Deck, proof: ShuffleProofWire): boolean {
  try {
    const n = input.length;
    if (output.length !== n) return false;
    if (proof.aux.length !== proof.rounds || proof.openings.length !== proof.rounds) return false;
    const aux: Deck[] = proof.aux.map((d) => d.map(cipherFromWire));
    if (aux.some((d) => d.length !== n)) return false;
    const bits = challengeBits(pk, input, output, aux, proof.rounds);
    for (let j = 0; j < proof.rounds; j += 1) {
      const opening = proof.openings[j]!;
      if (!isPermutation(opening.perm, n)) return false;
      if (opening.rand.length !== n) return false;
      const rand = opening.rand.map(scalarFromB64);
      const base = bits[j] ? output : input; // bit=1 -> output link, bit=0 -> input link
      const rebuilt = applyShuffle(pk, base, opening.perm, rand);
      const target = aux[j]!;
      for (let i = 0; i < n; i += 1) {
        if (!rebuilt[i]!.c1.equals(target[i]!.c1) || !rebuilt[i]!.c2.equals(target[i]!.c2)) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
