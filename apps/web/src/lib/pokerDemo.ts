// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// A complete Hold'em hand played entirely in the browser with the real mental-poker crypto:
// aggregate keygen, a verifiable shuffle in turn, threshold unmask, betting, side pots and a
// proven showdown. One browser plays every seat here, so it holds every key and can show all
// hole cards; in real multiplayer each browser holds only its own key. Shuffle proof rounds
// are reduced for snappiness (the library default is 64); the construction is identical.

import {
  applyStep,
  bestRankOfIndices,
  cardIndexOf,
  Category,
  cipherFromWire,
  combineUnmask,
  handComplete,
  initHand,
  newSeatSecret,
  proveKey,
  seatShuffle,
  unmaskShare,
  unmaskShareD,
  type BetAction,
  type HandConfig,
  type HandState,
  type PokerStep,
  type SeatSecret,
} from "@flop-poker/arena-poker";

const DEMO_ROUNDS = 4;

export interface DemoSeat {
  label: string;
  hole: [number, number];
  folded: boolean;
  startStack: number;
  endStack: number;
  won: number;
  bestHand: string;
}

export interface DemoHand {
  seats: DemoSeat[];
  community: number[];
  pots: { amount: number; eligible: number[] }[];
  log: { phase: string; text: string }[];
  winners: number[];
}

const N = 3;
const holePos = (s: number) => [s, s + N];
const CATEGORY_NAME = [
  "high card",
  "a pair",
  "two pair",
  "three of a kind",
  "a straight",
  "a flush",
  "a full house",
  "four of a kind",
  "a straight flush",
];

function handName(hole: number[], board: number[]): string {
  if (board.length < 3) return "";
  const r = bestRankOfIndices([...hole, ...board]);
  return CATEGORY_NAME[r[0] ?? 0] ?? "high card";
}

export function dealDemoHand(): DemoHand {
  const labels = ["You (seat 0)", "Bot 1", "Bot 2"];
  const seatsDid = labels.map((_, i) => `did:key:z6MkDEMOseat${i}`);
  const cfg: HandConfig = { seats: seatsDid, stacks: [100, 500, 500], button: 0, sb: 10, bb: 20, label: "demo|h0" };
  const secrets: SeatSecret[] = seatsDid.map(() => newSeatSecret());
  const log: { phase: string; text: string }[] = [];
  const say = (phase: string, text: string) => log.push({ phase, text });

  let state = initHand(cfg);
  const must = (r: { state: HandState; ok: boolean; reason?: string }) => {
    if (!r.ok) throw new Error("demo step rejected: " + r.reason);
    return r.state;
  };

  for (let s = 0; s < N; s += 1) state = must(applyStep(state, { kind: "key", seat: s, proof: proveKey(secrets[s]!.share, `${cfg.label}|key${s}`) }));
  say("keygen", "3 seats published key shares with proofs; the deck key is their sum, known to nobody.");

  for (let s = 0; s < N; s += 1) {
    const { deck, proof } = seatShuffle(state.aggKeyB64!, state.deck!, DEMO_ROUNDS);
    state = must(applyStep(state, { kind: "shuffle", seat: s, deck, proof }));
  }
  say("shuffle", "Each seat shuffled and remasked the deck, proving the shuffle was honest.");

  const deck = state.deck!;
  const shareOf = (seat: number, pos: number) => unmaskShare(secrets[seat]!.share, cipherFromWire(deck[pos]!), `${cfg.label}|pos${pos}`);
  const step = (seat: number, pos: number): PokerStep => ({ kind: "unmask", seat, pos, share: shareOf(seat, pos) });

  // the demo holds every key, so it can read every hole card for display
  const revealAll = (pos: number): number => {
    const ct = cipherFromWire(deck[pos]!);
    const ds = secrets.map((sec) => unmaskShareD(unmaskShare(sec.share, ct, `${cfg.label}|pos${pos}`)));
    return cardIndexOf(combineUnmask(ct, ds));
  };
  const allHole: [number, number][] = seatsDid.map((_, s) => holePos(s).map(revealAll) as [number, number]);

  // deal: non-holders contribute to each hole position
  for (let s = 0; s < N; s += 1) for (const pos of holePos(s)) for (let c = 0; c < N; c += 1) if (c !== s) state = must(applyStep(state, step(c, pos)));
  say("deal", "Hole cards dealt by threshold decryption. Only each holder can read its own two.");

  const base = 2 * N;
  const streetNeeds: Record<string, number[]> = { flop: [base, base + 1, base + 2], turn: [base + 3], river: [base + 4] };
  const plan: Record<string, BetAction[]> = {
    preflop: [
      { seat: 0, type: "allin" },
      { seat: 1, type: "call" },
      { seat: 2, type: "call" },
    ],
    flop: [
      { seat: 1, type: "bet", to: 200 },
      { seat: 2, type: "call" },
    ],
    turn: [
      { seat: 1, type: "check" },
      { seat: 2, type: "check" },
    ],
    river: [
      { seat: 1, type: "check" },
      { seat: 2, type: "check" },
    ],
  };
  const betText: Record<string, string> = {
    preflop: "Preflop: You are short and shove all-in for 100. Both bots call.",
    flop: "Flop: Bot 1 bets 200 into a side pot. Bot 2 calls. You are already all-in.",
    turn: "Turn: both bots check.",
    river: "River: both bots check to showdown.",
  };

  for (const st of ["preflop", "flop", "turn", "river"] as const) {
    if (handComplete(state)) break;
    if (st !== "preflop" && state.phase === st) {
      for (const pos of streetNeeds[st]!) for (let c = 0; c < N; c += 1) if (!state.shares.get(pos)?.has(c)) state = must(applyStep(state, step(c, pos)));
      say(st, `${st === "flop" ? "Flop" : st === "turn" ? "Turn" : "River"} revealed: ${streetNeeds[st]!.map((p) => "card").length} community card(s) unmasked by all seats.`);
    }
    if (state.phase === st && state.street) {
      say(st, betText[st] ?? "");
      for (const action of plan[st] ?? []) {
        if (!state.street) break;
        state = must(applyStep(state, { kind: "bet", seat: action.seat, action }));
      }
    }
  }

  if (state.phase === "showdown") {
    for (let s = 0; s < N; s += 1) if (!state.folded[s]) for (const pos of holePos(s)) state = must(applyStep(state, { kind: "reveal", seat: s, pos, share: shareOf(s, pos) }));
    say("showdown", "Everyone still in revealed their hole cards, proven against the committed deck.");
  }

  const community = state.community;
  const startStacks = cfg.stacks;
  const payouts = state.payouts ?? state.stacks;
  const seats: DemoSeat[] = labels.map((label, i) => ({
    label,
    hole: allHole[i]!,
    folded: state.folded[i] ?? false,
    startStack: startStacks[i] ?? 0,
    endStack: payouts[i] ?? 0,
    won: (payouts[i] ?? 0) - (startStacks[i] ?? 0),
    bestHand: handName(allHole[i]!, community),
  }));
  const pots = buildPotsView(state.committedTotal, state.folded);
  const winners = seats.map((s, i) => ({ s, i })).filter(({ s }) => s.won > 0).map(({ i }) => i);
  say("result", `Main pot 300 (all three eligible) and a side pot 400 (only the two deep stacks). ${winners.map((i) => labels[i]).join(", ")} won.`);

  return { seats, community, pots, log, winners };
}

// tiny local mirror so the page can show the pot structure without importing arena twice
function buildPotsView(committed: number[], folded: boolean[]) {
  const n = committed.length;
  const levels = [...new Set(committed.filter((c) => c > 0))].sort((a, b) => a - b);
  const raw: { amount: number; eligible: number[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    let count = 0;
    for (let s = 0; s < n; s += 1) if ((committed[s] ?? 0) >= level) count += 1;
    const eligible: number[] = [];
    for (let s = 0; s < n; s += 1) if ((committed[s] ?? 0) >= level && !folded[s]) eligible.push(s);
    raw.push({ amount: (level - prev) * count, eligible });
    prev = level;
  }
  return raw;
}
