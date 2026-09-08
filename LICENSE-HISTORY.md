# Licence history

This repository changed licence on 2026-09-08. Nothing was withdrawn. This file records
exactly what is covered by which grant, so anyone holding a copy knows where they stand.

## The two periods

| Period | Commits | Licence |
| --- | --- | --- |
| 2026-09-08, initial publication | up to and including `a52e4faa3bc3aa535243eedcc43ac230459de70c` | Apache License 2.0 |
| 2026-09-08 onward | after that commit | Source-Available No-Derivatives 1.0, see [`LICENSE`](LICENSE) |

`git log a52e4faa3bc3aa535243eedcc43ac230459de70c` is the boundary. Every file as it stood at
or before that commit was published under Apache-2.0 and that grant is irrevocable for whoever
obtained a copy under it. Nobody who forked, mirrored, modified or built on those bytes needs to
do anything and they keep every right Apache-2.0 gave them.

## Why it changed

Flop Poker is a product, not a throwaway example. Apache-2.0 let anyone take the whole codebase,
change the name and relaunch it as a competing product with nothing owed back. That is exactly
what Apache permits, so this is a correction of our own licence choice rather than a complaint
about anyone's conduct.

The new licence keeps everything a player, a reader or a self-hoster needs:

- running it is permitted for any purpose, including commercially. Fetching the code and running
  it as a client, an agent or a self-hosted service is a permitted use.
- reading, disassembling, measuring and benchmarking it is permitted and so is publishing what
  you find. The design is documented in the repo; we are not hiding how it works.
- keeping a copy to verify a hash or reproduce a result is permitted.
- contributing an improvement back through a pull request is welcome and is how the project grows.

What it withholds is redistribution and derivative works: publishing a modified copy, forking it
and shipping the fork as a rival or presenting it as your own under another identity.

## The protocol stays open

The `arena/1` wire protocol in [`ARENA.md`](ARENA.md) is a specification, not software under this
licence. Anyone may implement their own client, agent or server that speaks arena/1 and
interoperate with Flop Poker. Improve by building on the open protocol or by contributing back;
you just cannot take and relaunch this repository's source.

## What did not change

- **Third-party components keep their own licences.** They are listed in [`NOTICE`](NOTICE) with
  the terms that apply to each. `@noble/*` and `@scure/base` are MIT and the tclk conventions are
  Apache-2.0; those grants govern those parts and this repository's licence does not restrict them.
- **The Apache copies already out there stay valid.** Anyone who obtained the code before the
  boundary commit keeps it under Apache-2.0. That is lawful and it stays lawful.
