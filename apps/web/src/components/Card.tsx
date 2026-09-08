// SPDX-License-Identifier: Apache-2.0
import { cardName } from "@flop-poker/arena-poker";

const RED = new Set([1, 2]); // diamonds, hearts

export function PlayingCard({ index, hidden }: { index?: number; hidden?: boolean }) {
  if (hidden || index === undefined || index < 0) return <div className="pcard back">x</div>;
  const suit = Math.floor(index / 13);
  const name = cardName(index);
  const rank = name.slice(0, -1);
  const suitCh = { c: "♣", d: "♦", h: "♥", s: "♠" }[name.slice(-1)] ?? "?";
  return (
    <div className={"pcard" + (RED.has(suit) ? " red" : "")}>
      <span>
        {rank}
        {suitCh}
      </span>
    </div>
  );
}
