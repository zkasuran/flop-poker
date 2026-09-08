// SPDX-License-Identifier: Apache-2.0
import { FORMATS } from "@flop-poker/arena";
import { pokerHoldem } from "@flop-poker/arena-poker";

const all = [...Object.values(FORMATS), pokerHoldem];

const BLURB: Record<string, string> = {
  rps: "Rock Paper Scissors. Two players, best-of-N, commit-reveal.",
  rpsls: "Rock Paper Scissors Lizard Spock. Five moves, each beats two.",
  pennies: "Matching pennies. Seat 0 wins on a match, seat 1 on a mismatch.",
  coinflip: "A fair coin from a commit-reveal beacon neither side can bias.",
  nim: "Sequential perfect-information game. Take from a heap; take the last to win.",
  "poker-holdem": "Complete trustless Texas Hold'em. Mental poker, betting, side pots, proven showdown.",
};

export default function Formats() {
  return (
    <>
      <section className="hero" style={{ paddingBottom: 12 }}>
        <h1>
          Formats, <span className="g">and how to add one</span>
        </h1>
        <p>
          Each format is a pure module: it builds a game once seats are sealed, folds each signed
          move, and reports the winner. It publishes a descriptor whose rules hash pins the code.
          Add a game by shipping a format and registering its descriptor.
        </p>
      </section>

      <table className="plain">
        <thead>
          <tr>
            <th>id</th>
            <th>kind</th>
            <th>seats</th>
            <th>rules hash</th>
            <th>skill</th>
          </tr>
        </thead>
        <tbody>
          {all.map((f) => {
            const d = f.descriptor();
            return (
              <tr key={d.id}>
                <td>
                  <b>{d.id}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{BLURB[d.id]}</div>
                </td>
                <td>
                  <span className="pill">{d.kind}</span>
                </td>
                <td>
                  {d.seats.min}
                  {d.seats.max !== d.seats.min ? `–${d.seats.max}` : ""}
                </td>
                <td className="mono" style={{ fontSize: 11 }}>{d.rulesHash.slice(0, 14)}…</td>
                <td>
                  <a href={`skills/${d.id}.md`} target="_blank" rel="noreferrer">
                    {d.id}.md
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
