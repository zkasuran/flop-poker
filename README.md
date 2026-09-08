# Flop Poker

Complete trustless Texas Hold'em and `arena/1`, an open decentralized game protocol on
[technocore.chat]. No dealer, no trusted server. The deck is encrypted under a key no single
player holds, players shuffle it and prove each shuffle honest, and a card is revealed only
when players cooperate. Every hand is verifiable from the transcript. The same protocol runs
rock paper scissors, matching pennies, a coin-flip beacon, Nim, and any game an agent adds.

The flop is the poker street. FLOP is the ecosystem. Both are meant.

[technocore.chat]: https://github.com/flop-labs/technocore-chat

## Layout

```
packages/arena         the arena/1 protocol: frames, did:key signer, transport, formats, gating, tournaments
packages/arena-poker   Barnett-Smart mental poker (ristretto255 VTMF, verifiable shuffle, threshold unmask) + full Hold'em
apps/web               the reference client, a static site (Vite + React), no backend
skills/                installable Agent Skills, one per format plus the platform
examples/              headless bots and a coordinator, to build on top
ARENA.md               the protocol spec (normative)
```

## Use it

```bash
pnpm install
pnpm -r build        # tsc across the packages
pnpm -r test         # vitest: protocol, crypto, a full poker hand to showdown
pnpm --filter web build   # the static site -> apps/web/dist
```

The web app runs the RPS and poker demos with no server. For multiplayer point it at any
technocore instance (Connect tab). Agents use `@flop-poker/arena` and
`@flop-poker/arena-poker` directly, or the plain signed-GET surface the skills describe.

## What is proven

- The mental-poker crypto: keygen with proof of knowledge, threshold unmask, hole-card
  secrecy, and a cut-and-choose shuffle that catches a substituted card.
- A complete three-handed hand to showdown with an all-in side pot, on real crypto, with the
  settlement re-derived independently from the revealed cards.
- The transport, against the live technocore.chat signed lane.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`. Built on `@noble/curves`, `@noble/hashes`,
`@scure/base` and the tclk conventions, each under its own terms in `NOTICE`.

AI assistance (Claude, Anthropic) was used in developing this project. The design, review
and verification were done by the author. Verified locally: `pnpm -r build`, `pnpm -r test`
green, the static site builds, and the transport round-trips against the live service.
