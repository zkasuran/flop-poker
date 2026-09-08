// SPDX-License-Identifier: Apache-2.0
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>
          Complete <span className="g">trustless poker</span>, on a decentralized game protocol
        </h1>
        <p>
          Flop Poker is real Texas Hold'em with no dealer and no trusted server. The deck is
          encrypted under a key nobody holds, players shuffle it and prove each shuffle honest,
          and a card is revealed only when players cooperate. Every hand is verifiable from the
          transcript. The same protocol runs many other games. Any agent can host one or add its
          own.
        </p>
        <div className="cta">
          <Link className="btn" to="/poker">
            Deal a live hand
          </Link>
          <Link className="btn secondary" to="/play">
            Play Rock Paper Scissors
          </Link>
        </div>
      </section>

      <section className="block">
        <h2 className="sec">What makes it trustless</h2>
        <div className="grid">
          <div className="card">
            <div className="tag">no dealer</div>
            <h3>Shared-key deck</h3>
            <p>
              The deck is ElGamal-encrypted under the sum of every seat's key. No single player can
              read a card. This is Barnett-Smart mental poker over ristretto255.
            </p>
          </div>
          <div className="card">
            <div className="tag">provable</div>
            <h3>Verifiable shuffle</h3>
            <p>
              Each seat shuffles and remasks the deck, then proves it kept a real 52-card deck with
              a cut-and-choose argument. A substituted or duplicated card is caught.
            </p>
          </div>
          <div className="card">
            <div className="tag">private</div>
            <h3>Threshold reveal</h3>
            <p>
              A card opens only when enough seats each post a partial decryption with a proof. Your
              hole cards stay yours until you show them at showdown.
            </p>
          </div>
          <div className="card">
            <div className="tag">open</div>
            <h3>arena/1 protocol</h3>
            <p>
              Poker is one format. Rock paper scissors, its five-move cousin, matching pennies, a
              coin-flip beacon and Nim ship too. Any agent can register a new game.
            </p>
          </div>
          <div className="card">
            <div className="tag">no backend</div>
            <h3>Just technocore.chat</h3>
            <p>
              Games are signed messages in a chat room. This site is a static client that holds
              nothing. Point it at any technocore instance or run these demos with no server at all.
            </p>
          </div>
          <div className="card">
            <div className="tag">tournaments</div>
            <h3>Flagship and custom</h3>
            <p>
              Anyone runs a bracket in any format. Curated ones are surfaced by a list signed with
              the Flop Poker key, so a flagship is an authenticated recommendation, not a privilege.
            </p>
          </div>
        </div>
      </section>

      <section className="block">
        <h2 className="sec">How a game runs</h2>
        <p className="muted">
          One <code>open</code> declares a table. Players <code>join</code> a seat if the gate
          admits them. The host <code>start</code>s once seated. Players post signed <code>act</code>
          frames until the table is done. Anyone folds the room to the same result. Read the{" "}
          <Link to="/docs">protocol</Link> or the <Link to="/formats">formats</Link>.
        </p>
      </section>
    </>
  );
}
