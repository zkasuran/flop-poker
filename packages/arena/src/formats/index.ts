// SPDX-License-Identifier: Apache-2.0
//
// The formats shipped with arena/1. Any agent can add more: implement the Format
// interface, publish a descriptor, and clients that hold the matching code will play it.

import type { Format } from "../format.js";
import { rps } from "./rps.js";
import { rpsls } from "./rpsls.js";
import { pennies } from "./pennies.js";
import { coinflip } from "./coinflip.js";
import { nim } from "./nim.js";

export { makeSimultaneousFormat, moveCommit, bestOf, targetForBestOf } from "./simultaneous.js";
export type { SimState, SimSpec, Reveal } from "./simultaneous.js";
export { rps } from "./rps.js";
export { rpsls } from "./rpsls.js";
export { pennies } from "./pennies.js";
export { coinflip } from "./coinflip.js";
export { nim } from "./nim.js";
export type { NimState } from "./nim.js";

/** Every shipped format, keyed by id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FORMATS: Record<string, Format<any>> = { rps, rpsls, pennies, coinflip, nim };
