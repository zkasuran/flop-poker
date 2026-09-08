// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// Content-addressed note blobs. A signed room frame is capped at one single-line message,
// far smaller than a poker shuffle proof, so bulk payloads live in notes keyed by their
// own sha256 and the signed `act` frame carries only the hash. Fail-closed: a blob whose
// bytes do not hash to the requested id is ignored, so the world-writable note store
// cannot substitute a payload the signed frame did not commit to.

import { sha256Hex } from "./bytes.js";
import type { Technocore } from "./transport.js";

const MAX_NOTE_CHARS = 8192;
const CHUNK = 8000; // headroom under the note cap
const MANIFEST_PREFIX = "arena-blob-manifest ";

/** Where a blob (or its manifest) lives, sharded off its hash to spread the namespace. */
export function blobNote(hash: string): { ns: string; key: string } {
  const h = hash.replace(/^0x/, "");
  return { ns: "arena-blob-" + h.slice(0, 2), key: h.slice(2, 16) };
}

interface Manifest {
  v: 1;
  len: number;
  chunks: string[]; // hashes of each chunk, in order
}

/**
 * Store a value and return its `0x`-sha256 id. Small values are one note; larger ones are
 * split into chunk notes with a manifest at the id's own note. The id is over the whole
 * value either way.
 */
export async function putBlob(tech: Technocore, value: string): Promise<string> {
  const hash = sha256Hex(value);
  if (value.length <= MAX_NOTE_CHARS && !value.startsWith(MANIFEST_PREFIX)) {
    const { ns, key } = blobNote(hash);
    await tech.setNote(ns, key, value);
    return hash;
  }
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK) {
    const part = value.slice(i, i + CHUNK);
    const ch = sha256Hex(part);
    const { ns, key } = blobNote(ch);
    await tech.setNote(ns, key, part);
    chunks.push(ch);
  }
  const manifest: Manifest = { v: 1, len: value.length, chunks };
  const { ns, key } = blobNote(hash);
  await tech.setNote(ns, key, MANIFEST_PREFIX + JSON.stringify(manifest));
  return hash;
}

/** Fetch and verify a blob by id. Null if missing or if the bytes do not match the id. */
export async function getBlob(tech: Technocore, hash: string): Promise<string | null> {
  const { ns, key } = blobNote(hash);
  const stored = await tech.getNote(ns, key);
  if (stored === null) return null;
  if (!stored.startsWith(MANIFEST_PREFIX)) {
    return sha256Hex(stored) === hash ? stored : null;
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(stored.slice(MANIFEST_PREFIX.length)) as Manifest;
  } catch {
    return null;
  }
  let value = "";
  for (const ch of manifest.chunks) {
    const b = blobNote(ch);
    const part = await tech.getNote(b.ns, b.key);
    if (part === null || sha256Hex(part) !== ch) return null;
    value += part;
  }
  return sha256Hex(value) === hash && value.length === manifest.len ? value : null;
}
