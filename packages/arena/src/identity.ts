// SPDX-License-Identifier: Apache-2.0
//
// did:key (Ed25519) identity: encode, decode, sign and verify. technocore.chat's
// signed lane verifies an Ed25519 signature over `<room>|<nonce>|<text>` where the
// identifier IS the key, so there is no resolver and verification is offline.
//
// The multicodec/multibase byte layout and the canonical-signature rule (86 base64url
// chars, last one in {A,Q,g,w}) are the venue's, matched here so an arena signature is
// exactly what the server and any other stack accept.

import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";

import { b64uDecode, b64uEncode, hexToBytes, sha256Hex, utf8ToBytes } from "./bytes.js";

const PREFIX = "did:key:";
// varint-encoded multicodec `ed25519-pub`; every Ed25519 did:key base58s to z6Mk...
const MULTICODEC_ED25519 = new Uint8Array([0xed, 0x01]);
const MULTIBASE_CHARS = 48; // 'z' + 47 base58 chars for 34 bytes (2 codec + 32 key)
const SIG_CHARS = 86;
const CANONICAL_LAST = new Set(["A", "Q", "g", "w"]);

export class DidError extends Error {}
export class SignatureError extends Error {}

/** The did:key string for a raw 32-byte Ed25519 public key. */
export function didFromPublicKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) throw new DidError("public key must be 32 bytes");
  const tagged = new Uint8Array(MULTICODEC_ED25519.length + 32);
  tagged.set(MULTICODEC_ED25519, 0);
  tagged.set(publicKey, MULTICODEC_ED25519.length);
  return PREFIX + "z" + base58.encode(tagged);
}

/** The raw 32-byte Ed25519 public key of a did:key, or throw DidError. */
export function publicKeyFromDid(did: string): Uint8Array {
  if (typeof did !== "string" || !did.startsWith(PREFIX)) {
    throw new DidError("expected did:key:z6Mk...");
  }
  const mb = did.slice(PREFIX.length);
  if (mb.length !== MULTIBASE_CHARS || !mb.startsWith("z")) {
    throw new DidError(`expected ${MULTIBASE_CHARS} multibase chars starting 'z'`);
  }
  let decoded: Uint8Array;
  try {
    decoded = base58.decode(mb.slice(1));
  } catch {
    throw new DidError("did:key is not valid base58btc");
  }
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new DidError("only ed25519-pub (z6Mk...) did:keys are accepted");
  }
  return decoded.slice(2);
}

export function isDid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    publicKeyFromDid(value);
    return true;
  } catch {
    return false;
  }
}

/** `did:key:z6Mk…2doK` for compact display; the wire always carries the full DID. */
export function abbreviate(did: string): string {
  const mb = did.slice(PREFIX.length);
  return `${mb.slice(0, 4)}…${mb.slice(-4)}`;
}

/**
 * Verify `signature` is `did`'s Ed25519 signature over `message` (utf-8). Throws
 * SignatureError on a well-formed key whose signature does not cover the message, and
 * DidError on a malformed key or signature encoding. Never returns false: callers that
 * want a boolean use `tryVerify`.
 */
export function verify(did: string, signature: string, message: string): void {
  const publicKey = publicKeyFromDid(did);
  if (signature.length !== SIG_CHARS || !CANONICAL_LAST.has(signature[SIG_CHARS - 1]!)) {
    throw new DidError(`signature must be ${SIG_CHARS} base64url chars ending A/Q/g/w`);
  }
  let raw: Uint8Array;
  try {
    raw = b64uDecode(signature);
  } catch {
    throw new DidError("signature is not base64url");
  }
  if (!ed25519.verify(raw, utf8ToBytes(message), publicKey)) {
    throw new SignatureError("signature does not cover this message");
  }
}

export function tryVerify(did: string, signature: string, message: string): boolean {
  try {
    verify(did, signature, message);
    return true;
  } catch {
    return false;
  }
}

/** An Ed25519 signer. The DID is public; the secret key never leaves this object. */
export interface Identity {
  readonly did: string;
  readonly publicKey: Uint8Array;
  /** Canonical base64url signature over the utf-8 message. */
  sign(message: string): string;
}

function identityFromSeed(seed: Uint8Array): Identity {
  if (seed.length !== 32) throw new DidError("Ed25519 seed must be 32 bytes");
  const secret = seed.slice();
  const publicKey = ed25519.getPublicKey(secret);
  const did = didFromPublicKey(publicKey);
  return {
    did,
    publicKey,
    sign(message: string): string {
      const sig = b64uEncode(ed25519.sign(utf8ToBytes(message), secret));
      // A standard base64url encoder zeroes the unused trailing bits, so the last
      // character is always canonical; assert it rather than trust it silently.
      if (sig.length !== SIG_CHARS || !CANONICAL_LAST.has(sig[SIG_CHARS - 1]!)) {
        throw new Error("arena: produced a non-canonical signature");
      }
      return sig;
    },
  };
}

/** A fresh random identity. Its seed is discarded, so it lives only in this object. */
export function generateIdentity(): Identity {
  return identityFromSeed(ed25519.utils.randomSecretKey());
}

/** Deterministic identity from a 32-byte seed. */
export function identityFromSecretSeed(seed: Uint8Array): Identity {
  return identityFromSeed(seed);
}

/**
 * Identity from 64 hex characters (used as the seed directly) or any other string
 * (sha256 of it becomes the seed, so a passphrase works). Weaker than randomness, fine
 * for a demo player, never for an identity that must survive.
 */
export function identityFromHexOrPassphrase(value: string): Identity {
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(value)) {
    return identityFromSeed(hexToBytes(value.replace(/^0x/, "").toLowerCase()));
  }
  return identityFromSeed(hexToBytes(sha256Hex(value).slice(2)));
}
