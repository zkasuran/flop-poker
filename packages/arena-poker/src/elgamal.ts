// SPDX-License-Identifier: Apache-2.0
//
// ElGamal over ristretto255, the masking half of the VTMF. A card is a point M; a
// ciphertext under the aggregate key pk with randomness r is (r·G, M + r·pk). Remasking
// adds a fresh encryption of the identity, producing a new ciphertext for the same card
// that nobody can link to the old one without the shared secret — which no single player
// holds. The initial deck is the trivial encryption (0, M_i), public until the first
// shuffle remasks it.

import { G, ZERO, pointFromB64, pointToB64, type Pt } from "./group.js";

export interface Cipher {
  c1: Pt;
  c2: Pt;
}

export interface CipherWire {
  c1: string;
  c2: string;
}

export function mask(pk: Pt, m: Pt, r: bigint): Cipher {
  return { c1: G.multiply(r), c2: m.add(pk.multiply(r)) };
}

/** A fresh ciphertext for the same plaintext: add an encryption of zero with randomness r. */
export function remask(pk: Pt, ct: Cipher, r: bigint): Cipher {
  return { c1: ct.c1.add(G.multiply(r)), c2: ct.c2.add(pk.multiply(r)) };
}

/** The public, unmasked initial encryption of a card point. */
export function trivial(m: Pt): Cipher {
  return { c1: ZERO, c2: m };
}

export function cipherToWire(ct: Cipher): CipherWire {
  return { c1: pointToB64(ct.c1), c2: pointToB64(ct.c2) };
}

export function cipherFromWire(w: CipherWire): Cipher {
  return { c1: pointFromB64(w.c1), c2: pointFromB64(w.c2) };
}

export function cipherEquals(a: Cipher, b: Cipher): boolean {
  return a.c1.equals(b.c1) && a.c2.equals(b.c2);
}
