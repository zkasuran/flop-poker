// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
// A persisted ephemeral did:key. The seed lives in localStorage, never leaves the browser.
import { bytesToHex, hexToBytes, identityFromSecretSeed, randomBytes, type Identity } from "@flop-poker/arena";

const KEY = "flop-poker.seed";

export function getIdentity(): Identity {
  let hex = localStorage.getItem(KEY);
  if (!hex || hex.length !== 64) {
    hex = bytesToHex(randomBytes(32));
    localStorage.setItem(KEY, hex);
  }
  return identityFromSecretSeed(hexToBytes(hex));
}

export function resetIdentity(): Identity {
  localStorage.setItem(KEY, bytesToHex(randomBytes(32)));
  return getIdentity();
}
