// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// The simultaneous-move engine: commit-reveal, shared by rock-paper-scissors and its
// relatives, matching pennies, and the coin-flip randomness beacon. Both players commit
// sha256(move + salt) before anyone reveals, so neither can see the other's move first
// and a late player cannot copy an early one. Reveals are checked against the commitment
// and the move set. The commitment binds the table, hand, round and sender, so a
// commitment cannot be lifted into another game or replayed across rounds.

import { sha256Hex } from "../bytes.js";
import { ARENA_DOMAIN } from "../frames.js";
import type { ActFrame, Json } from "../frames.js";
import { changed, unchanged } from "../format.js";
import type { Format, FormatContext, FormatDescriptor, Outcome, StepResult } from "../format.js";

export interface Reveal {
  move: string;
  salt: string;
}

interface Round {
  commits: Record<string, string>;
  reveals: Record<string, Reveal>;
}

export interface SimState {
  seats: string[];
  moves: string[];
  target: number;
  maxRounds: number;
  wins: Record<string, number>;
  rounds: Round[];
  done: boolean;
  hand: number;
}

export interface SimSpec {
  id: string;
  version: string;
  skill: string;
  moves: string[];
  seats: { min: number; max: number };
  /** wins needed to end the match, from params (default best-of resolves this). */
  target: (params: Json) => number;
  /** hard round cap, from params. */
  maxRounds: (params: Json) => number;
  /** round winners from the revealed moves+salts, in seat order. Empty is a tie. */
  scoreRound: (reveals: (Reveal | undefined)[], seats: string[], round: number) => string[];
  /** the canonical rules string hashed into the descriptor. */
  rules: () => Json;
}

const HEX_SALT = /^0x[0-9a-f]{64}$/;

/** Read a positive integer `bestOf` from params, defaulting to a single decisive game. */
export function bestOf(params: Json, def = 1): number {
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const v = (params as Record<string, unknown>).bestOf;
    if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  }
  return def;
}

export const targetForBestOf = (n: number): number => Math.floor(n / 2) + 1;

/** The exact string a move commitment covers. Players and the engine must agree. */
export function moveCommit(
  table: string,
  hand: number,
  round: number,
  from: string,
  move: string,
  salt: string,
): string {
  return sha256Hex(`${ARENA_DOMAIN}|move|${table}|${hand}|${round}|${from}|${move}|${salt}`);
}

function newRound(): Round {
  return { commits: {}, reveals: {} };
}

function bestWinners(wins: Record<string, number>, seats: string[]): string[] {
  let top = -1;
  for (const s of seats) top = Math.max(top, wins[s] ?? 0);
  if (top <= 0) return [];
  const leaders = seats.filter((s) => (wins[s] ?? 0) === top);
  return leaders.length === seats.length ? [] : leaders;
}

export function makeSimultaneousFormat(spec: SimSpec): Format<SimState> {
  const rulesHash = sha256Hex(
    JSON.stringify({ id: spec.id, version: spec.version, kind: "simultaneous", moves: spec.moves, seats: spec.seats, rules: spec.rules() }),
  );

  function descriptor(): FormatDescriptor {
    return { id: spec.id, version: spec.version, kind: "simultaneous", seats: spec.seats, rulesHash, skill: spec.skill };
  }

  return {
    id: spec.id,
    version: spec.version,
    kind: "simultaneous",
    seats: spec.seats,
    skill: spec.skill,
    descriptor,

    init(ctx: FormatContext, params: Json): SimState {
      return {
        seats: ctx.seats,
        moves: spec.moves,
        target: spec.target(params),
        maxRounds: spec.maxRounds(params),
        wins: Object.fromEntries(ctx.seats.map((s) => [s, 0])),
        rounds: [newRound()],
        done: false,
        hand: 0,
      };
    },

    step(state: SimState, act: ActFrame, ctx: FormatContext): StepResult<SimState> {
      if (state.done) return unchanged(state, "match over");
      const round = state.rounds.length - 1;
      const cur = state.rounds[round]!;
      const from = act.from;
      if (!state.seats.includes(from)) return unchanged(state, "not a seated player");

      if (act.step === "commit") {
        if (cur.commits[from]) return unchanged(state, "already committed this round");
        if (typeof act.data !== "string" || !/^0x[0-9a-f]{64}$/.test(act.data)) {
          return unchanged(state, "commit must be a 0x-sha256");
        }
        const rounds = state.rounds.slice();
        rounds[round] = { ...cur, commits: { ...cur.commits, [from]: act.data } };
        return changed({ ...state, rounds });
      }

      if (act.step === "reveal") {
        const commit = cur.commits[from];
        if (!commit) return unchanged(state, "no commitment to reveal");
        if (cur.reveals[from]) return unchanged(state, "already revealed");
        const d = act.data as { move?: unknown; salt?: unknown } | undefined;
        if (!d || typeof d.move !== "string" || typeof d.salt !== "string") {
          return unchanged(state, "reveal needs {move,salt}");
        }
        if (!state.moves.includes(d.move)) return unchanged(state, "move not in the move set");
        if (!HEX_SALT.test(d.salt)) return unchanged(state, "salt must be 0x-32-bytes");
        if (moveCommit(ctx.table, state.hand, round, from, d.move, d.salt) !== commit) {
          return unchanged(state, "reveal does not match the commitment");
        }
        const rounds = state.rounds.slice();
        const reveals = { ...cur.reveals, [from]: { move: d.move, salt: d.salt } };
        rounds[round] = { ...cur, reveals };

        // Score the round only once every seat has revealed.
        if (state.seats.every((s) => reveals[s])) {
          const bySeat = state.seats.map((s) => reveals[s]);
          const winners = spec.scoreRound(bySeat, state.seats, round);
          const wins = { ...state.wins };
          for (const w of winners) wins[w] = (wins[w] ?? 0) + 1;
          const reachedTarget = state.seats.some((s) => (wins[s] ?? 0) >= state.target);
          const lastRound = round + 1 >= state.maxRounds;
          const done = reachedTarget || lastRound;
          const next = { ...state, rounds, wins, done };
          if (!done) next.rounds = [...rounds, newRound()];
          return changed(next);
        }
        return changed({ ...state, rounds });
      }

      return unchanged(state, `unknown step ${act.step}`);
    },

    isTerminal: (s) => s.done,

    outcome(state: SimState): Outcome {
      return { winners: bestWinners(state.wins, state.seats), scores: state.wins };
    },
  };
}
