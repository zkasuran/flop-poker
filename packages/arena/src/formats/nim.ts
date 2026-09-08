// SPDX-License-Identifier: Apache-2.0
//
// Nim: a sequential perfect-information game, here to prove the non-simultaneous path.
// Players alternate removing one or more objects from a single heap. Normal play: whoever
// takes the last object wins. Misere (params.misere=true): whoever takes the last loses.
// No hidden state and no commitment — a signed move in turn order is the whole protocol.

import { sha256Hex } from "../bytes.js";
import type { ActFrame, Json } from "../frames.js";
import { changed, unchanged } from "../format.js";
import type { Format, FormatContext, FormatDescriptor, Outcome, StepResult } from "../format.js";

export interface NimState {
  seats: string[];
  heaps: number[];
  turn: number;
  misere: boolean;
  moveCount: number;
  done: boolean;
  winner: string | null;
}

const RULES = { win: "take-the-last (params.misere flips it)", turnOrder: "seat order" };
const rulesHash = sha256Hex(JSON.stringify({ id: "nim", version: "1", kind: "sequential", rules: RULES }));

function readHeaps(params: Json): number[] {
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const h = (params as Record<string, unknown>).heaps;
    if (Array.isArray(h) && h.length > 0 && h.every((n) => Number.isInteger(n) && (n as number) > 0)) {
      return (h as number[]).slice();
    }
  }
  return [3, 4, 5];
}

function readMisere(params: Json): boolean {
  return !!(params && typeof params === "object" && !Array.isArray(params) && (params as Record<string, unknown>).misere);
}

export const nim: Format<NimState> = {
  id: "nim",
  version: "1",
  kind: "sequential",
  seats: { min: 2, max: 2 },
  skill: "skills/nim.skill.md",

  descriptor(): FormatDescriptor {
    return { id: "nim", version: "1", kind: "sequential", seats: { min: 2, max: 2 }, rulesHash, skill: "skills/nim.skill.md" };
  },

  init(ctx: FormatContext, params: Json): NimState {
    return {
      seats: ctx.seats,
      heaps: readHeaps(params),
      turn: 0,
      misere: readMisere(params),
      moveCount: 0,
      done: false,
      winner: null,
    };
  },

  step(state: NimState, act: ActFrame): StepResult<NimState> {
    if (state.done) return unchanged(state, "game over");
    if (act.step !== "move") return unchanged(state, `unknown step ${act.step}`);
    if (act.from !== state.seats[state.turn]) return unchanged(state, "not your turn");
    const d = act.data as { heap?: unknown; count?: unknown } | undefined;
    if (!d || !Number.isInteger(d.heap) || !Number.isInteger(d.count)) {
      return unchanged(state, "move needs integer {heap,count}");
    }
    const heap = d.heap as number;
    const count = d.count as number;
    const have = state.heaps[heap];
    if (have === undefined || count < 1 || count > have) return unchanged(state, "illegal take");

    const heaps = state.heaps.slice();
    heaps[heap] = have - count;
    const emptied = heaps.every((n) => n === 0);
    const mover = state.seats[state.turn]!;
    const other = state.seats[(state.turn + 1) % state.seats.length]!;
    if (emptied) {
      return changed({
        ...state,
        heaps,
        moveCount: state.moveCount + 1,
        done: true,
        winner: state.misere ? other : mover,
      });
    }
    return changed({
      ...state,
      heaps,
      moveCount: state.moveCount + 1,
      turn: (state.turn + 1) % state.seats.length,
    });
  },

  isTerminal: (s) => s.done,

  outcome(state: NimState): Outcome {
    return { winners: state.winner ? [state.winner] : [], detail: { heaps: state.heaps, moves: state.moveCount } };
  },
};
