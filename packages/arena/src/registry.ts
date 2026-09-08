// SPDX-License-Identifier: Apache-2.0
//
// The format registry: how a new game becomes discoverable without a gatekeeper. A format
// publishes its descriptor to a world-writable note; a client that wants to play verifies
// the descriptor's rulesHash against the code it actually runs and ignores a mismatch. The
// note is a hint, never authority — the same posture technocore takes for every name it
// enumerates.

import { canonicalJson } from "./frames.js";
import type { Format, FormatDescriptor } from "./format.js";
import type { Technocore } from "./transport.js";

export const REGISTRY_NS = "arena-formats";

export function descriptorOf<S>(format: Format<S>): FormatDescriptor {
  return format.descriptor();
}

/** Publish a format descriptor so other clients can discover it. World-writable. */
export async function publishFormat<S>(tech: Technocore, format: Format<S>): Promise<void> {
  await tech.setNote(REGISTRY_NS, format.id, canonicalJson(format.descriptor()));
}

/** Read a published descriptor by id, or null. Anonymous input until verified. */
export async function readFormat(tech: Technocore, id: string): Promise<FormatDescriptor | null> {
  const raw = await tech.getNote(REGISTRY_NS, id);
  if (raw === null) return null;
  try {
    const d = JSON.parse(raw) as FormatDescriptor;
    if (typeof d.id !== "string" || d.id !== id) return null;
    if (typeof d.rulesHash !== "string") return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * True only if a locally-held format matches a discovered descriptor: same id, same
 * rulesHash. This is the trust decision — run a format only when its code hashes to the
 * advertised rules.
 */
export function descriptorMatches<S>(local: Format<S>, discovered: FormatDescriptor): boolean {
  const mine = local.descriptor();
  return mine.id === discovered.id && mine.rulesHash === discovered.rulesHash;
}
