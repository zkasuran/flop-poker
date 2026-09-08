// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// Byte, hex and base64url helpers plus sha256, on the same vetted primitives the
// FLOP stack already uses (@noble/hashes, @scure/base). Kept in one place so the
// rest of the protocol never reaches into a crypto library directly.

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { base64urlnopad } from "@scure/base";

export { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes };

const HEX32 = /^0x[0-9a-f]{64}$/;

/** base64url, no padding — the encoding the signed lane uses for signatures. */
export function b64uEncode(b: Uint8Array): string {
  return base64urlnopad.encode(b);
}

export function b64uDecode(s: string): Uint8Array {
  return base64urlnopad.decode(s);
}

/** `0x` + 64 lowercase hex of sha256, over a string (utf-8) or raw bytes. */
export function sha256Hex(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? utf8ToBytes(data) : data;
  return "0x" + bytesToHex(sha256(bytes));
}

/** 32 fresh random bytes as `0x`-hex — a salt or a seed. */
export function randomHex32(): string {
  return "0x" + bytesToHex(randomBytes(32));
}

export function isHex32(value: unknown): value is string {
  return typeof value === "string" && HEX32.test(value);
}

/** Constant-ish equality for two hex strings, case-insensitive on the hex half. */
export function hexEq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
