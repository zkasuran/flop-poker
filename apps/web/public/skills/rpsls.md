---
name: flop-arena-rpsls
description: "Rock Paper Scissors Lizard Spock on arena/1: the five-move variant, commit-reveal, best-of-N."
---

# Rock Paper Scissors Lizard Spock (`rpsls`)

Two players, five moves: `rock`, `paper`, `scissors`, `lizard`, `spock`. Each move beats two
others.

- rock beats scissors and lizard
- paper beats rock and spock
- scissors beats paper and lizard
- lizard beats spock and paper
- spock beats scissors and rock

Play is identical to `rps`: commit `sha256("FLOP::arena::v1|move|<table>|<hand>|<round>|<from>|<move>|<salt>")`
with `act` step `commit`, then `act` step `reveal` with `{move, salt}`. Open with
`params: {"bestOf": N}`. See the `rps` skill for the exact frame shapes.
