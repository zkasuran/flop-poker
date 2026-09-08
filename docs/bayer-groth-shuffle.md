// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0

# A Bayer-Groth drop-in for the poker shuffle

Status: design note. No code yet. Tracks issue #1.

This note is for whoever picks up issue #1. It records what the current shuffle
argument costs, what a Bayer-Groth argument would cost at our deck size, which
sub-arguments have to be built, which parts of the statement must be bound into
the Fiat-Shamir transcript and how to land the change without a flag day.
Nothing here says the present argument is broken. It is complete and sound. The
question is only proof size.

## 1. Where we are

`packages/arena-poker/src/shuffle.ts` proves that a shuffled deck is a
permutation and rerandomisation of the input deck, using a cut-and-choose
argument over ristretto255 ElGamal ciphertexts. The prover publishes a batch of
candidate shuffles, the verifier challenges a subset, the prover opens the
challenged ones and the unopened ones are chained to the claimed output. Each
opened repetition reveals a permutation plus the rerandomisation scalars used
for it, which is why an opened repetition tells the verifier nothing about the
real permutation.

Soundness error is 2^-k for k repetitions. That is the whole cost story.

### The cost, in bytes

A compressed ristretto255 point is 32 bytes. An ElGamal ciphertext is two
points, so 64 bytes. A 52 card deck is 3328 bytes.

Per repetition the prover publishes at minimum one candidate deck (3328 bytes)
and, when challenged, an opening consisting of 52 permutation indices plus 52
scalars (52 * 32 = 1664 bytes). Call it about 5 KB of wire per repetition once
encoding overhead is counted. For a soundness error around 2^-40 that is on the
order of 200 KB for one shuffle. Check the repetition count actually used in the
module before quoting a number in a commit message. The point stands whatever
the constant is: the proof is linear in the security parameter and linear in the
deck, so it is two orders of magnitude larger than the deck it is about.

That is why these proofs ride the blob layer rather than sitting inline in a
frame. In a six seat table every seat shuffles, so a single hand carries roughly
six of these objects before a card is dealt.

### The cost, in verifier work

Cut-and-choose verification is dominated by k full rerandomisations of the deck,
so about k * N scalar multiplications with N = 52. At k = 40 that is more than
two thousand scalar mults per shuffle, per verifier.

## 2. What Bayer-Groth changes

Bayer and Groth give a zero-knowledge argument for correctness of a shuffle with
communication O(sqrt(N)) group elements and verification dominated by a single
multi-exponentiation of size N. The deck is arranged as an m by n matrix with
N = m * n. For a 52 card deck the natural factorisations are 4 by 13 or 13 by 4.

Honest accounting at our size:

- Proof size. The asymptotic win is small at N = 52 because sqrt(52) is about 7.
  The real win is that the proof stops being multiplied by the security
  parameter. Instead of k repetitions of a deck we send a fixed handful of
  commitments plus scalars, so a few kilobytes rather than a few hundred. That
  is a 50x to 100x reduction in blob traffic per shuffle.
- Verifier work. Roughly N plus O(sqrt(N)) group operations rather than k * N,
  so about an order of magnitude better and it batches well because the bulk of
  it is one multi-exponentiation.
- Prover work. Comparable or slightly better, but the code is far harder.

So the honest summary is: this is a bandwidth change, not a latency change. It
is worth doing because the blob layer is the scarce resource, not the CPU.

## 3. Sub-arguments to build

The shuffle argument is not one protocol. It is a stack. A contributor should
plan to implement and test each layer on its own before wiring the top.

1. Pedersen commitments to vectors over ristretto255, with a generator set
   derived by domain separated hash-to-group. There must be no trapdoor, so
   generators are derived from a fixed label such as
   `arena-poker/bg-shuffle/v1/gen/<index>` rather than sampled by anyone.
2. Zero argument, proving that a bilinear map over two committed vector families
   evaluates to zero.
3. Hadamard product argument, built on the zero argument.
4. Single value product argument.
5. Product argument, proving that the entries of a committed vector multiply to
   a claimed scalar. This is what pins the permutation, via the classic trick
   that the product of (x_i - c) over a permuted vector equals the product over
   the original for a random challenge c.
6. Multi-exponentiation argument, proving that a committed matrix of exponents
   applied to the input ciphertexts yields the output ciphertexts up to a known
   rerandomisation.
7. The shuffle argument itself, composing the product argument (the committed
   matrix is a permutation matrix) with the multi-exponentiation argument (the
   permutation was applied to the actual ciphertexts).

Every layer is a public coin argument, so every layer needs its challenges drawn
from the shared transcript, not from fresh randomness.

## 4. Transcript binding, the part that gets people

The published attacks on deployed shuffle proofs are almost never attacks on the
algebra. They are attacks on what was left out of the hash.

Rules for this implementation:

- One transcript object per proof, seeded with a version label such as
  `arena-poker/bg-shuffle/v1`.
- Absorb, before any challenge is drawn: the ElGamal public key, the full input
  deck, the full output deck, the commitment generators or the label they were
  derived from, the table identifier, the hand number and the seat or DID of the
  prover.
- Absorb every prover message in order and draw every challenge only after the
  messages it depends on are absorbed.
- Reject a proof whose deck lengths differ or whose deck length does not match
  the m by n factorisation encoded in the proof.

Binding the table identifier, hand number and prover identity is what stops a
proof from being lifted out of one hand and replayed in another where the same
deck happens to recur. Bernhard, Pereira and Warinschi call the version that
omits the statement weak Fiat-Shamir and it is exactly the shape of bug that
Haines, Lewis, Pereira and Teague found in a shipped election shuffle proof.
Write the transcript first and the algebra second.

## 5. What the drop-in must preserve

The interface in `packages/arena-poker/src/shuffle.ts` is a prove and verify
pair over an input deck, an output deck and a public key, producing an opaque
byte string. Check the exact export names in the module before writing code.
The drop-in should:

- Keep the proof opaque at the boundary. Frames and the blob layer only carry
  bytes, so no frame schema change is needed if the new proof is still a byte
  string.
- Carry a version tag in the first bytes of the proof so a verifier can dispatch
  between the cut-and-choose argument and the new one. Without a tag, a mixed
  table cannot tell a malformed old proof from a well formed new one.
- Advertise support in the table open parameters so seats that only know the old
  argument are not silently excluded. A table should agree on one argument for
  the whole hand.
- Preserve rerandomisation semantics exactly. The unmask path in
  `packages/arena-poker/src/vtmf.ts` and the deal path in `holdem.ts` must not
  care which argument produced the deck.

Do not delete the cut-and-choose argument. It becomes the reference oracle for
differential testing and the fallback if a bug is found in the new stack.

## 6. Test plan

A contributor should be able to point at each of these:

- Round trip. An honest shuffle verifies, at several deck sizes that factor
  cleanly and at 52.
- Tamper on the output. Flipping any single output ciphertext fails
  verification. Loop over every index rather than testing one.
- Tamper on the input. Verifying against a different input deck fails.
- Wrong public key. A proof made under one ElGamal key fails under another.
- Cross-hand replay. A valid proof from hand 1 fails when checked with the hand
  2 context, which is the direct test of section 4.
- Length and shape. Mismatched deck lengths, a deck length that does not match
  the claimed factorisation and a truncated proof all fail cleanly rather than
  throwing an unhandled error.
- Identity permutation. A shuffle that permutes nothing but does rerandomise
  still verifies, because that is a legal shuffle.
- Determinism. Given fixed randomness the proof bytes are stable, so the
  transcript can be pinned by a test vector.
- Differential. For the same input the old argument and the new argument both
  accept the same honest output deck and both reject the same corrupted ones.

## 7. Staged migration

1. Land the sub-arguments with their own tests. No integration yet.
2. Land the shuffle argument behind a version tag, verifier side first, so nodes
   can check new proofs before any node produces them.
3. Turn on production of the new proof for tables that advertise support, with
   the old argument still the default.
4. Flip the default once a release has passed with dual verification in place.
5. Keep the old prover and verifier in the tree as the differential oracle.

## 8. References

- Bayer and Groth. Efficient Zero-Knowledge Argument for Correctness of a
  Shuffle. Eurocrypt 2012. ARENA.md cites 2014, which matches the later revised
  full version of the same argument.
- Barnett and Smart. Mental Poker Revisited. Cryptography and Coding 2003. This
  is the protocol the rest of `arena-poker` implements.
- Terelius and Wikstrom. Proofs of Restricted Shuffles. Africacrypt 2010. The
  main alternative if the Bayer-Groth stack proves too large to maintain.
- Bernhard, Pereira and Warinschi. How Not to Prove Yourself: Pitfalls of the
  Fiat-Shamir Heuristic and Applications to Helios. Asiacrypt 2012.
- Haines, Lewis, Pereira and Teague. How Not to Prove Your Election Outcome.
  IEEE S&P 2020. Read this before writing the transcript code.
