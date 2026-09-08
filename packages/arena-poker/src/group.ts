// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// The prime-order group for mental poker: ristretto255 via @noble/curves. Ristretto is a
// prime-order group with a clean hash-to-group, so there are no cofactor or small-subgroup
// traps, and a card is a group element the deck maps to a fixed table of 52 points.
//
// Scalars are bigints in [0, ORDER). Points serialize to 32 bytes, carried on the wire as
// base64url. The Fiat-Shamir challenge hashes a transcript of labels and points into a
// scalar, which is what turns each interactive proof below into a non-interactive one.

import { ristretto255, ristretto255_hasher } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { base64urlnopad } from "@scure/base";

const P = ristretto255.Point;

export type Pt = InstanceType<typeof ristretto255.Point>;

export const G: Pt = P.BASE;
export const ZERO: Pt = P.ZERO;
export const ORDER: bigint = P.Fn.ORDER;

// ── scalars ──────────────────────────────────────────────────────────────────

function bytesToBigIntBE(b: Uint8Array): bigint {
  let n = 0n;
  for (const byte of b) n = (n << 8n) | BigInt(byte);
  return n;
}

/** A uniform non-zero scalar in [1, ORDER). 64 random bytes reduce off any modulo bias. */
export function randomScalar(): bigint {
  for (;;) {
    const s = bytesToBigIntBE(randomBytes(64)) % ORDER;
    if (s !== 0n) return s;
  }
}

export function scalarToBytes(x: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let n = ((x % ORDER) + ORDER) % ORDER;
  for (let i = 31; i >= 0; i -= 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

export const mod = (x: bigint): bigint => ((x % ORDER) + ORDER) % ORDER;

// ── serialization ──────────────────────────────────────────────────────────

export function pointToB64(p: Pt): string {
  return base64urlnopad.encode(p.toBytes());
}
export function pointFromB64(s: string): Pt {
  return P.fromBytes(base64urlnopad.decode(s));
}
export function scalarToB64(x: bigint): string {
  return base64urlnopad.encode(scalarToBytes(x));
}
export function scalarFromB64(s: string): bigint {
  return mod(bytesToBigIntBE(base64urlnopad.decode(s)));
}

// ── Fiat-Shamir ────────────────────────────────────────────────────────────

/** Hash a transcript of labels, points and scalars into a challenge scalar. */
export function challenge(...items: Array<string | Pt | bigint>): bigint {
  const parts: Uint8Array[] = [utf8ToBytes("arena-poker/fs/v1")];
  for (const it of items) {
    if (typeof it === "string") parts.push(utf8ToBytes("s:" + it));
    else if (typeof it === "bigint") parts.push(utf8ToBytes("n:"), scalarToBytes(it));
    else parts.push(utf8ToBytes("p:"), it.toBytes());
  }
  return mod(bytesToBigIntBE(sha256(concatBytes(...parts))));
}

// ── card points ──────────────────────────────────────────────────────────────

export const DECK_SIZE = 52;

let CARDS: Pt[] | null = null;

/** The 52 fixed card points. A full unmask yields one of these; its index is the card. */
export function cardPoints(): Pt[] {
  if (CARDS) return CARDS;
  const pts: Pt[] = [];
  for (let i = 0; i < DECK_SIZE; i += 1) {
    pts.push(ristretto255_hasher.hashToCurve(utf8ToBytes(`arena:card:${i}`)) as Pt);
  }
  CARDS = pts;
  return pts;
}

/** The point for card index 0..51. */
export function cardPoint(index: number): Pt {
  const pts = cardPoints();
  const p = pts[index];
  if (!p) throw new Error(`arena-poker: card index ${index} out of range`);
  return p;
}

/** The card index a point decodes to, or -1 if it is not a card point. */
export function cardIndexOf(point: Pt): number {
  const pts = cardPoints();
  for (let i = 0; i < pts.length; i += 1) if (pts[i]!.equals(point)) return i;
  return -1;
}
