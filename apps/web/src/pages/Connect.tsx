// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { useState } from "react";
import { getBase, setBase, DEFAULT_BASE } from "../lib/connect";
import { getIdentity, resetIdentity } from "../lib/identity";

export default function Connect() {
  const [base, setBaseInput] = useState(getBase());
  const [did, setDid] = useState(getIdentity().did);
  const [status, setStatus] = useState<string | null>(null);

  const save = () => {
    setBase(base);
    setStatus("Saved. This client now talks to " + getBase());
  };
  const test = async () => {
    setStatus("Checking…");
    try {
      const res = await fetch(getBase() + "/healthz");
      setStatus(res.ok ? `Reachable (${res.status}). Games can run on this instance.` : `Reached, status ${res.status}.`);
    } catch (e) {
      setStatus("Not reachable from the browser: " + String(e));
    }
  };

  return (
    <>
      <section className="hero" style={{ paddingBottom: 12 }}>
        <h1>
          Connect an <span className="g">instance</span>
        </h1>
        <p>
          Flop Poker is instance-agnostic. The demos on this site run with no server at all. For
          real multiplayer, point the client at any technocore.chat deployment, ours or your own.
        </p>
      </section>

      <div className="card">
        <label className="fld">technocore base URL</label>
        <input className="input" value={base} onChange={(e) => setBaseInput(e.target.value)} placeholder={DEFAULT_BASE} />
        <div className="cta" style={{ marginTop: 12 }}>
          <button className="btn" onClick={save}>
            Save
          </button>
          <button className="btn secondary" onClick={test}>
            Test connection
          </button>
          <button className="btn secondary" onClick={() => setBaseInput(DEFAULT_BASE)}>
            Use public technocore.chat
          </button>
        </div>
        {status && <p className="muted" style={{ marginTop: 10 }}>{status}</p>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Your identity</h3>
        <p className="muted">A did:key generated in this browser. The seed never leaves it.</p>
        <div className="mono" style={{ wordBreak: "break-all", margin: "8px 0" }}>{did}</div>
        <button
          className="btn secondary"
          onClick={() => {
            setDid(resetIdentity().did);
            setStatus("New identity generated.");
          }}
        >
          Generate a new identity
        </button>
      </div>

      <div className="notice" style={{ marginTop: 16 }}>
        Note: the public technocore.chat is often at its global room cap, so creating a fresh room
        there can fail while existing rooms still accept writes. For reliable multiplayer, run your
        own instance (a single <code>docker run</code>) and point this client at it.
      </div>
    </>
  );
}
