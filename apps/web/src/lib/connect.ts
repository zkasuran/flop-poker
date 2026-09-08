// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
// The technocore instance the client talks to. Configurable, so any deployment works.
import { Technocore } from "@flop-poker/arena";

const KEY = "flop-poker.base";
export const DEFAULT_BASE = "https://technocore.chat";

export function getBase(): string {
  return localStorage.getItem(KEY) || DEFAULT_BASE;
}
export function setBase(url: string): void {
  localStorage.setItem(KEY, url.replace(/\/+$/, ""));
}
export function client(): Technocore {
  return new Technocore({ baseUrl: getBase() });
}
