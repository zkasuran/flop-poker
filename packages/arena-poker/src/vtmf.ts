// SPDX-License-Identifier: Apache-2.0
//
// Verifiable threshold masking (Barnett-Smart). Every seat generates a key share and
// proves knowledge of it (Schnorr PoK, which blocks a rogue-key seat from cancelling the
// others). The aggregate public key is the sum of the shares, and its secret stays unknown
// while one honest seat hides its share. To reveal a card, seats contribute partial
// decryptions, each with a Chaum-Pedersen proof that the same secret sits behind the seat's
// public key and its contribution, so a seat cannot lie about its share to steer a reveal.
//
// A card is revealed to one player by having everyone else contribute; a community card is
// revealed to all by having everyone contribute. Either way the plaintext is c2 minus the
// sum of contributions, matched back to the 52-point table.

import { challenge, G, mod, pointFromB64, pointToB64, randomScalar, scalarFromB64, scalarToB64, type Pt } from "./group.js";
import type { Cipher } from "./elgamal.js";

export interface KeyShare {
  sk: bigint;
  pk: Pt;
}

export interface KeyProofWire {
  pk: string;
  a: string; // commitment A = k·G
  z: string; // response k + e·sk
}

/** A fresh key share for one seat. */
export function keygen(): KeyShare {
  const sk = randomScalar();
  return { sk, pk: G.multiply(sk) };
}

/** Schnorr proof of knowledge of sk behind pk = sk·G, bound to a label (table/hand/seat). */
export function proveKey(share: KeyShare, label: string): KeyProofWire {
  const k = randomScalar();
  const A = G.multiply(k);
  const e = challenge("kpok", label, share.pk, A);
  const z = mod(k + e * share.sk);
  return { pk: pointToB64(share.pk), a: pointToB64(A), z: scalarToB64(z) };
}

export function verifyKeyProof(proof: KeyProofWire, label: string): boolean {
  try {
    const pk = pointFromB64(proof.pk);
    const A = pointFromB64(proof.a);
    const z = scalarFromB64(proof.z);
    const e = challenge("kpok", label, pk, A);
    // G·z == A + pk·e
    return G.multiply(z).equals(A.add(pk.multiply(e)));
  } catch {
    return false;
  }
}

/** The aggregate public key is the sum of the seat public keys. */
export function aggregate(pks: Pt[]): Pt {
  if (pks.length === 0) throw new Error("arena-poker: no key shares to aggregate");
  return pks.reduce((acc, p) => acc.add(p));
}

export function pkOf(proof: KeyProofWire): Pt {
  return pointFromB64(proof.pk);
}

// ── threshold unmask ─────────────────────────────────────────────────────────

export interface UnmaskShareWire {
  /** the seat's contribution d = sk·c1 */
  d: string;
  a: string; // A = k·G
  b: string; // B = k·c1
  z: string; // k + e·sk
}

/**
 * One seat's contribution to unmasking a ciphertext, with a Chaum-Pedersen proof that the
 * seat's key `pk` and its contribution `d` share the same secret. `label` binds it to the
 * card being opened.
 */
export function unmaskShare(share: KeyShare, ct: Cipher, label: string): UnmaskShareWire {
  const d = ct.c1.multiply(share.sk);
  const k = randomScalar();
  const A = G.multiply(k);
  const B = ct.c1.multiply(k);
  const e = challenge("cp", label, G, ct.c1, share.pk, d, A, B);
  const z = mod(k + e * share.sk);
  return { d: pointToB64(d), a: pointToB64(A), b: pointToB64(B), z: scalarToB64(z) };
}

/** Verify a seat's unmask contribution against that seat's public key. */
export function verifyUnmaskShare(wire: UnmaskShareWire, ct: Cipher, pk: Pt, label: string): boolean {
  try {
    const d = pointFromB64(wire.d);
    const A = pointFromB64(wire.a);
    const B = pointFromB64(wire.b);
    const z = scalarFromB64(wire.z);
    const e = challenge("cp", label, G, ct.c1, pk, d, A, B);
    // G·z == A + pk·e  AND  c1·z == B + d·e
    return G.multiply(z).equals(A.add(pk.multiply(e))) && ct.c1.multiply(z).equals(B.add(d.multiply(e)));
  } catch {
    return false;
  }
}

/** Combine verified contributions: plaintext point = c2 - Σ d_i. */
export function combineUnmask(ct: Cipher, contributions: Pt[]): Pt {
  let sum: Pt | null = null;
  for (const d of contributions) sum = sum ? sum.add(d) : d;
  return sum ? ct.c2.subtract(sum) : ct.c2;
}

export function unmaskShareD(wire: UnmaskShareWire): Pt {
  return pointFromB64(wire.d);
}
