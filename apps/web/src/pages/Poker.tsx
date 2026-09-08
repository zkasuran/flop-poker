// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { useEffect, useState } from "react";
import { PlayingCard } from "../components/Card";
import { dealDemoHand, type DemoHand } from "../lib/pokerDemo";

export default function Poker() {
  const [hand, setHand] = useState<DemoHand | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const deal = () => {
    setBusy(true);
    setErr(null);
    // defer so the button paints its busy state before the crypto runs
    setTimeout(() => {
      try {
        setHand(dealDemoHand());
      } catch (e) {
        setErr(String(e));
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  useEffect(deal, []);

  return (
    <>
      <section className="hero" style={{ paddingBottom: 12 }}>
        <h1>
          A full <span className="g">trustless hand</span>, dealt in your browser
        </h1>
        <p>
          Real Barnett-Smart mental poker runs right here: aggregate keygen, a verifiable shuffle,
          threshold unmask, betting, a side pot and a proven showdown. No server is involved.
        </p>
        <div className="cta">
          <button className="btn" onClick={deal} disabled={busy}>
            {busy ? "Dealing (running the crypto)…" : "Deal another hand"}
          </button>
        </div>
      </section>

      <div className="notice">
        Demo mode: one browser plays all three seats, so it holds every key and shows every hand
        face-up. In real multiplayer each player holds only their own key and sees only their own
        two cards. Shuffle proofs use reduced rounds here for speed; the construction is the same.
      </div>

      {err && <p style={{ color: "var(--lose)" }}>{err}</p>}

      {hand && (
        <>
          <div className="felt">
            <div className="board">
              {hand.community.length === 0 && <span className="muted">community cards appear on the flop</span>}
              {hand.community.map((c, i) => (
                <PlayingCard key={i} index={c} />
              ))}
            </div>
            <div className="pot">
              {hand.pots.map((p, i) => (
                <div key={i} className="potline">
                  {i === 0 ? "Main pot" : `Side pot ${i}`}: {p.amount} chips · eligible seats{" "}
                  {p.eligible.map((s) => s).join(", ")}
                </div>
              ))}
            </div>
            <div className="seats" style={{ marginTop: 16 }}>
              {hand.seats.map((s, i) => (
                <div key={i} className={"seat" + (hand.winners.includes(i) ? " win" : "") + (s.folded ? " folded" : "")}>
                  <div className="who">{s.label}</div>
                  <div className="stack">
                    {s.endStack}{" "}
                    <span className={"delta " + (s.won >= 0 ? "up" : "down")}>
                      ({s.won >= 0 ? "+" : ""}
                      {s.won})
                    </span>
                  </div>
                  <div className="hand">
                    <PlayingCard index={s.hole[0]} />
                    <PlayingCard index={s.hole[1]} />
                  </div>
                  {hand.community.length >= 3 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{s.bestHand}</div>}
                </div>
              ))}
            </div>
          </div>

          <section className="block">
            <h2 className="sec">What happened</h2>
            <div className="log">
              {hand.log.map((l, i) => (
                <div className="row" key={i}>
                  <span className="ph">{l.phase}</span> · {l.text}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
