// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// Poker as an arena/1 format. It maps the generic `act` frames onto the Hold'em reducer's
// steps, so poker discovers, gates, and folds through the same machinery as every other
// game. Large payloads (a shuffle's deck and proof) ride the blob layer: the act carries
// the blob hash and the resolved JSON arrives in ctx.blobs.

import { changed, sha256Hex, unchanged } from "@flop-poker/arena";
import type { ActFrame, Format, FormatContext, FormatDescriptor, Json, Outcome, StepResult } from "@flop-poker/arena";

import { applyStep, handComplete, initHand, type HandConfig, type HandState, type PokerStep } from "./holdem.js";
import type { CipherWire } from "./elgamal.js";
import type { ShuffleProofWire } from "./shuffle.js";
import type { KeyProofWire, UnmaskShareWire } from "./vtmf.js";
import type { ActionType } from "./betting.js";

const RULES = {
  game: "texas-holdem",
  crypto: "barnett-smart-vtmf",
  group: "ristretto255",
  shuffle: "cut-and-choose",
  unmask: "chaum-pedersen",
  burns: false,
} as const;

const RULES_HASH = sha256Hex(JSON.stringify({ id: "poker-holdem", version: "1", kind: "shuffle", rules: RULES }));
const SKILL = "skills/poker-holdem.skill.md";
const SEATS = { min: 2, max: 9 };

function numOr(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

function obj(v: Json | undefined): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function mapAct(seat: number, act: ActFrame, ctx: FormatContext): PokerStep | null {
  const d = obj(act.data);
  switch (act.step) {
    case "key":
      return d ? { kind: "key", seat, proof: d as unknown as KeyProofWire } : null;
    case "shuffle": {
      const raw = act.blob ? ctx.blobs?.[act.blob] : d ? JSON.stringify(d) : undefined;
      if (!raw) return null;
      try {
        const payload = JSON.parse(raw) as { deck: CipherWire[]; proof: ShuffleProofWire };
        if (!Array.isArray(payload.deck) || !payload.proof) return null;
        return { kind: "shuffle", seat, deck: payload.deck, proof: payload.proof };
      } catch {
        return null;
      }
    }
    case "unmask":
      if (!d || typeof d.pos !== "number" || !obj(d.share as Json)) return null;
      return { kind: "unmask", seat, pos: d.pos, share: d.share as unknown as UnmaskShareWire };
    case "reveal":
      if (!d || typeof d.pos !== "number" || !obj(d.share as Json)) return null;
      return { kind: "reveal", seat, pos: d.pos, share: d.share as unknown as UnmaskShareWire };
    case "bet": {
      if (!d || typeof d.type !== "string") return null;
      const type = d.type as ActionType;
      return { kind: "bet", seat, action: { seat, type, ...(typeof d.to === "number" ? { to: d.to } : {}) } };
    }
    default:
      return null;
  }
}

export const pokerHoldem: Format<HandState> = {
  id: "poker-holdem",
  version: "1",
  kind: "shuffle",
  seats: SEATS,
  skill: SKILL,

  descriptor(): FormatDescriptor {
    return { id: "poker-holdem", version: "1", kind: "shuffle", seats: SEATS, rulesHash: RULES_HASH, skill: SKILL };
  },

  init(ctx: FormatContext, params: Json): HandState {
    const p = obj(params) ?? {};
    const n = ctx.seats.length;
    const buyIn = numOr(p.buyIn, 1000);
    const stacks =
      Array.isArray(p.stacks) && p.stacks.length === n ? (p.stacks as number[]).slice() : new Array<number>(n).fill(buyIn);
    const cfg: HandConfig = {
      seats: ctx.seats,
      stacks,
      button: numOr(p.button, 0) % n,
      sb: numOr(p.sb, 10),
      bb: numOr(p.bb, 20),
      label: `${ctx.table}|h0`,
    };
    return initHand(cfg);
  },

  step(state: HandState, act: ActFrame, ctx: FormatContext): StepResult<HandState> {
    const seat = ctx.seats.indexOf(act.from);
    if (seat < 0) return unchanged(state, "not a seated player");
    const step = mapAct(seat, act, ctx);
    if (!step) return unchanged(state, `unmappable act ${act.step}`);
    const r = applyStep(state, step);
    return r.ok ? changed(r.state) : unchanged(state, r.reason ?? "rejected");
  },

  isTerminal: (s) => handComplete(s),

  outcome(state: HandState, ctx: FormatContext): Outcome {
    const payouts = state.payouts ?? state.stacks;
    const start = state.cfg.stacks;
    const scores: Record<string, number> = {};
    ctx.seats.forEach((did, i) => {
      scores[did] = (payouts[i] ?? 0) - (start[i] ?? 0);
    });
    const winners = ctx.seats.filter((_, i) => (payouts[i] ?? 0) - (start[i] ?? 0) > 0);
    return { winners, scores, detail: { community: state.community } };
  },
};
