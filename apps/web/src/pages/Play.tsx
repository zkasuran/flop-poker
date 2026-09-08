// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import {
  encodeFrame,
  foldTable,
  generateIdentity,
  makeAct,
  makeJoin,
  makeOpen,
  makeStart,
  moveCommit,
  randomHex32,
  rps,
  signingMessage,
  tableRef,
  type ArenaFrame,
  type Identity,
  type Record,
} from "@flop-poker/arena";
import { getIdentity } from "../lib/identity";

const MOVES = ["rock", "paper", "scissors"] as const;
const EMOJI: Record<string, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
const ROOM = "local-rps";

interface Result {
  you: string;
  bot: string;
  yourCommit: string;
  botCommit: string;
  winner: "you" | "bot" | "tie";
}

function playRound(you: Identity, yourMove: string): Result {
  const bot = generateIdentity();
  const botMove = MOVES[Math.floor(Math.random() * 3)]!;
  const open = makeOpen({
    from: you.did,
    format: "rps",
    params: { bestOf: 1 },
    gate: { kind: "open" },
    seats: { min: 2, max: 2 },
  });
  const ref = tableRef(open);
  const yourSalt = randomHex32();
  const botSalt = randomHex32();
  const yourCommit = moveCommit(ref, 0, 0, you.did, yourMove, yourSalt);
  const botCommit = moveCommit(ref, 0, 0, bot.did, botMove, botSalt);

  const records: Record[] = [];
  let seq = 0;
  const push = (id: Identity, f: ArenaFrame) => {
    const text = encodeFrame(f);
    const nonce = String(1_700_000_000_000 + seq);
    records.push({ seq: seq++, ts: new Date().toISOString(), from: id.did, text, nonce, sig: id.sign(signingMessage(ROOM, nonce, text)) });
  };

  push(you, open);
  push(you, makeJoin(open, you.did));
  push(bot, makeJoin(open, bot.did));
  push(you, makeStart(open, you.did, [you.did, bot.did]));
  push(you, makeAct(open, you.did, { step: "commit", data: yourCommit }));
  push(bot, makeAct(open, bot.did, { step: "commit", data: botCommit }));
  push(you, makeAct(open, you.did, { step: "reveal", data: { move: yourMove, salt: yourSalt } }));
  push(bot, makeAct(open, bot.did, { step: "reveal", data: { move: botMove, salt: botSalt } }));

  const t = foldTable(ROOM, open, rps, records);
  const winners = t.outcome?.winners ?? [];
  const winner = winners.length === 0 ? "tie" : winners[0] === you.did ? "you" : "bot";
  return { you: yourMove, bot: botMove, yourCommit, botCommit, winner };
}

export default function Play() {
  const you = getIdentity();
  const [sel, setSel] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [score, setScore] = useState({ you: 0, bot: 0, tie: 0 });

  const go = (move: string) => {
    setSel(move);
    const r = playRound(you, move);
    setRes(r);
    setScore((s) => ({ ...s, [r.winner]: s[r.winner] + 1 }));
  };

  return (
    <>
      <section className="hero" style={{ paddingBottom: 12 }}>
        <h1>
          Rock Paper Scissors, <span className="g">commit-reveal</span>
        </h1>
        <p>
          Pick a move. Your move and the opponent's are each hidden behind a signed commitment
          first, then revealed, then folded to a result by the same protocol code the multiplayer
          game uses. Nobody can see the other move before committing.
        </p>
      </section>

      <div className="cta" style={{ marginBottom: 18 }}>
        {MOVES.map((m) => (
          <button key={m} className={"rpsmove" + (sel === m ? " sel" : "")} onClick={() => go(m)} title={m}>
            {EMOJI[m]}
          </button>
        ))}
      </div>

      {res && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-around", fontSize: 46 }}>
            <div style={{ textAlign: "center" }}>
              {EMOJI[res.you]}
              <div className="muted" style={{ fontSize: 13 }}>you</div>
            </div>
            <div style={{ alignSelf: "center", fontSize: 20 }}>
              {res.winner === "you" ? "you win" : res.winner === "bot" ? "you lose" : "tie"}
            </div>
            <div style={{ textAlign: "center" }}>
              {EMOJI[res.bot]}
              <div className="muted" style={{ fontSize: 13 }}>opponent</div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 14 }}>
            Score — you {score.you}, opponent {score.bot}, ties {score.tie}
          </p>
          <details>
            <summary className="muted">the commitments that were opened</summary>
            <div className="mono" style={{ marginTop: 8, wordBreak: "break-all" }}>
              your commit {res.yourCommit}
              <br />
              opp. commit {res.botCommit}
            </div>
          </details>
        </div>
      )}
    </>
  );
}
