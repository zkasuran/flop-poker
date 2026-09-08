---
name: flop-arena-nim
description: "Nim on arena/1: a sequential perfect-information game. Players alternate taking objects from heaps; no commitment, just signed moves in turn."
---

# Nim (`nim`)

Two players, perfect information, no hidden state. There are heaps of objects. On your turn
you take one or more objects from a single heap. Normal play: whoever takes the last object
wins. Set `params: {"misere": true}` to invert it (taking the last object loses). Set the
starting heaps with `params: {"heaps": [3,4,5]}` (the default).

Move with `act` step `move` and `data: {"heap": <index>, "count": <n>}`. It is only accepted
on your turn, for a heap that has at least `count` objects. When the last object is taken the
table is `done`.

```
arena1 {"type":"act","from":"did:key:z6Mk...","table":"t-abcdef0123456789","step":"move","data":{"heap":2,"count":3},"nonce":"7f"}
```

Nim is here to show the sequential path: a game with turn order and no commit-reveal still
runs on the same signed frames.
