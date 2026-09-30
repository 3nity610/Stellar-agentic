# Producing and verifying a solvency proof — walkthrough

This is the hands-on companion to
[zk-solvency-design.md](zk-solvency-design.md). That document explains *why*
the circuit is shaped the way it is; this one gets you from an empty directory
to a proof the `PaymentChannel` contract accepts, with every command and its
real output.

Read this end to end and you will be able to:

1. generate a Groth16 proving/verifying key pair,
2. prove a private payment history is consistent with a channel's public
   `limit_per_period` and `total_spent`,
3. encode the proof for Soroban's native BLS12-381 host functions, and
4. install the verifying key and check the proof **on-chain**, through
   `set_solvency_vk` and `verify_solvency_proof`.

> **Scope warning, up front.** `solvency-prover setup` runs a *single-party*
> Groth16 setup. Whoever runs it could forge proofs if they kept the toxic
> waste, and it prints a warning saying so. This is fine for local testing and
> demos. It is **not** a production deployment — see
> [Trusted setup](zk-solvency-design.md#trusted-setup). Everything else in this
> guide — the circuit, the encoding bridge, the on-chain verifier — is the real
> thing.

---

## Prerequisites

| Tool | Used for | Notes |
| --- | --- | --- |
| Rust 1.84+ | building the prover | `cargo` only; the prover is a plain native binary |
| `jq` or `python3` | shaping JSON for the CLI | either is fine; examples below use `python3` |
| Stellar CLI 22+ | on-chain steps | `stellar contract invoke` |
| A funded account | `set_solvency_vk` | anyone can be the admin; the *first* caller becomes it |

`zk/` is its own Cargo workspace, deliberately separate from `contracts/` —
arkworks has no business in an on-chain WASM build. The contract depends on
Soroban's native BLS12-381 host functions, not on arkworks.

---

## Step 0 — Build the prover

```console
$ cd zk
$ cargo build --release --bin solvency-prover
    Finished `release` profile [optimized] target(s) in 1m 25s
```

The binary lands at `zk/target/release/solvency-prover`. Add
`zk/target/release` to your `PATH` for the rest of this guide, or write
`./zk/target/release/solvency-prover` each time. The examples below assume
you are in `zk/`.

---

## Step 1 — Generate the key pair

```console
$ solvency-prover setup --out-dir ./keys
WARNING: this is a toy, single-party Groth16 setup, not a real trusted-setup ceremony. Do not use these keys for anything beyond local testing/demos. See docs/zk-solvency-design.md.
wrote ./keys/pk.bin, ./keys/vk.bin, ./keys/vk_soroban.json
```

Three files come out:

| File | Size | What it is |
| --- | --- | --- |
| `pk.bin` | ~10.0 MiB | the proving key — **secret**; anyone with it can forge proofs |
| `vk.bin` | 488 B | the verifying key in arkworks' own format, for the local `verify` step |
| `vk_soroban.json` | ~2.0 KiB | the *same* verifying key in Soroban hex, ready to submit on-chain |

`vk_soroban.json` is already in the exact JSON shape the contract's
`SolvencyVerifyingKey` struct expects, so you can pass it straight through
without touching it (Step 5).

`setup` takes a few seconds and ~96 MB of RAM. It is deterministic in cost, not
in output: each run produces different keys, so a proof made with one
`pk.bin` will not verify against another run's `vk.bin`.

---

## Step 2 — Describe the private history

The history is the channel owner's own record of individual payments. It is the
thing the proof keeps confidential. Write it as a JSON array:

```console
$ cat > history.json
[
  { "amount": 100000, "period_index": 0 },
  { "amount": 200000, "period_index": 0 },
  { "amount":  50000, "period_index": 1 },
  { "amount": 400000, "period_index": 1 }
]
```

Three rules, all enforced by the prover before it spends any time:

- **At most 8 entries.** `MAX_PAYMENTS = 8` is a fixed circuit constant; a
  9th payment is `TooManyPayments`. See
  [Capacity](zk-solvency-design.md#capacity-max_payments--8) for what to do
  about it.
- **`period_index` is yours to assign.** It is a non-decreasing counter that
  only has to *group* payments that shared a spend-limit window. Derive it
  from `(ledger - period_start_ledger) / ledgers_per_period`; it does not need
  to equal an on-chain ledger number.
- **Order within a period does not matter, but the sum does.** The circuit
  proves that *some* grouping of these payments never exceeds
  `limit_per_period` in any period and sums to exactly `total_spent`.

In the example above, period 0 spends 300 000 and period 1 spends 450 000,
both under a 500 000 limit, and the total is 750 000.

---

## Step 3 — Prove

```console
$ solvency-prover prove \
    --pk ./keys/pk.bin \
    --history history.json \
    --limit 500000 \
    --total 750000 \
    --out proof.json
wrote proof.json
```

`--limit` is the channel's `limit_per_period` and `--total` is its
`total_spent`. **Both must match the on-chain channel exactly** — they are the
circuit's public inputs, and `verify_solvency_proof` re-reads them from the
channel rather than trusting the proof's own claims.

Proving takes ~24 s on an ordinary laptop (Intel Core i5-8365U, 8 threads,
release build) and ~153 MB of RAM. The cost is dominated by circuit
synthesis, and scales with `MAX_PAYMENTS`, not with the number of payments you
actually supply.

The prover refuses malformed input rather than producing a proof that would
fail later. Both failure modes are real outputs you may hit:

```console
$ solvency-prover prove --pk ./keys/pk.bin --history history.json \
    --limit 500000 --total 999999 --out bad.json
error: TotalMismatch { computed: 750000, claimed: 999999 }

$ solvency-prover prove --pk ./keys/pk.bin --history overlimit.json \
    --limit 500000 --total 600000 --out bad.json
error: PaymentExceedsLimit { amount: 600000, limit: 500000 }
```

`PaymentExceedsLimit` means the grouped spend within one `period_index`
crossed `limit_per_period` — check your period assignment, not your amounts.

---

## Step 4 — Check it locally

```console
$ solvency-prover verify --vk ./keys/vk.bin --proof proof.json
VALID
```

Verification is effectively instant (~0.01 s). `verify` re-decodes the hex
through the same Soroban bridge the contract uses, so `VALID` here means the
bytes you are about to submit are the bytes the contract will accept.

Now the negative case — change the claimed total and re-verify:

```console
$ python3 -c 'import json; p=json.load(open("proof.json")); p["total_spent"]=999999; json.dump(p, open("proof_tampered.json","w"), indent=2)'
$ solvency-prover verify --vk ./keys/vk.bin --proof proof_tampered.json
INVALID
error: proof did not verify
$ echo $?
1
```

Note that `proof.json` is a *standalone, self-describing* artifact: the CLI
records `limit_per_period` and `total_spent` alongside the curve points, so
`verify` can check the public inputs without the history. That is also why
tampering with `total_spent` in the file is caught — it is a public input, not
a comment.

---

## Step 5 — Install the verifying key on-chain

The contract has no verifying key until someone installs one.
`set_solvency_vk` is admin-gated, and the **first** caller becomes the admin
for later rotations — so a second admin cannot be added once one exists.

```console
$ PAYMENT_CHANNEL=C...      # from deployments/<network>.json
$ SRC=my-key                # any funded account; the first caller becomes admin

$ stellar contract invoke \
    --id "$PAYMENT_CHANNEL" \
    --source-account "$SRC" \
    --network testnet \
    --send=no \
    -- set_solvency_vk \
    --admin "$SRC" \
    --vk "$(cat keys/vk_soroban.json)"
```

`--send=no` simulates instead of submitting: it returns the simulation result
and the resources the transaction would consume, without touching the ledger.
Drop it once you are happy. The argument shape matches the rest of this repo's
deployment runbook — see [docs/deployment.md](deployment.md).

`set_solvency_vk` panics with
`solvency vk must have exactly 3 gamma_abc_g1 entries` if the key is not for
this circuit — `gamma_abc_g1[0]` is the constant term and `[1]`, `[2]` are
`limit_per_period` and `total_spent`, in that order.

The hex strings are `BytesN` values, which the CLI accepts as hex. `G1Affine`
is 96 bytes (48-byte `x` ‖ 48-byte `y`) and `G2Affine` is 192 bytes (two
96-byte `Fp2` halves), so:

```console
$ python3 -c 'import json; v=json.load(open("keys/vk_soroban.json")); print({k: (len(h)//2 if isinstance(h,str) else [len(x)//2 for x in h]) for k,h in v.items()})'
{'alpha_g1': 96, 'beta_g2': 192, 'gamma_g2': 192, 'delta_g2': 192, 'gamma_abc_g1': [96, 96, 96]}
```

---

## Step 6 — Verify the proof on-chain

`verify_solvency_proof` is a view call, so `--send=no` is all you need. Trim
the proof file to the three curve points first — the contract takes only those,
and the public inputs are re-read from the channel:

```console
$ python3 -c 'import json; p=json.load(open("proof.json")); json.dump({"a":p["a"],"b":p["b"],"c":p["c"]}, open("proof_onchain.json","w"))'

$ stellar contract invoke \
    --id "$PAYMENT_CHANNEL" \
    --source-account "$SRC" \
    --network testnet \
    --send=no \
    -- verify_solvency_proof \
    --channel-id 1 \
    --proof "$(cat proof_onchain.json)"
true
```

`true` means the contract's own `pairing_check` accepted it, against the
`limit_per_period` and `total_spent` read from channel 1's own storage. The
payment list itself never left your machine.

Two things to expect:

- **A wrong total is rejected, not trapped.** The contract reads the real
  channel state, so a proof built for a different `total_spent` returns
  `false` even though the proof is internally valid.
- **Corrupted bytes can trap.** Bytes that are not a point on the curve at all
  are rejected by Soroban's host input validation, which reverts the
  transaction rather than returning `false`. Both outcomes are rejections;
  callers should handle both.

---

## Cost and size, measured

Release build, Intel Core i5-8365U @ 1.6 GHz, 8 threads, Linux. `MAX_PAYMENTS = 8`.

| Step | Time | Peak RSS | Artifact size |
| --- | --- | --- | --- |
| `setup` | 4.4 s | 98 MB | `pk.bin` 10.0 MiB · `vk.bin` 488 B · `vk_soroban.json` 2.0 KiB |
| `prove` | 24.1 s | 153 MB | `proof.json` 858 B (curve points 384 B raw) |
| `verify` (local) | 0.01 s | — | — |

`prove` is the only number that matters operationally: ~24 s of CPU per proof.
Setup is one-off per key pair, and both are entirely off-chain. A single
`verify_solvency_proof` call is a fixed handful of `g1_add` / `g1_msm` /
`pairing_check` host calls plus two ledger reads, so its cost is **constant
regardless of how many payments the proof covers** — a proof over 8 payments
costs the same on-chain as one over 1.

Proof size is dominated by the `G2` element: 96 (`a`) + 192 (`b`) + 96 (`c`) =
384 bytes of curve data, inside an 858-byte `proof.json` (795 bytes once
trimmed to the `{a, b, c}` the contract takes). Once submitted, only the 384
bytes of curve data go on-chain.

---

## Verifying the on-chain path without a network

You do not need a running network to check that the encoding bridge and the
contract agree. This test runs a real payment history through the real
`PaymentChannel` contract, generates a real proof for it, and has the real
on-chain `verify_solvency_proof` — Soroban's genuine `pairing_check` host
function, not a mock — accept it:

```console
$ cargo test --release --test end_to_end
running 5 tests
test payment_still_works_normally_alongside_solvency_proofs ... ok
test proof_with_malformed_off_curve_bytes_traps - should panic ... ok
test valid_proof_is_accepted_by_the_real_on_chain_verifier ... ok
test proof_for_a_different_total_spent_is_rejected ... ok
test proof_with_a_component_swapped_from_another_proof_is_rejected ... ok

test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

If the arkworks↔Soroban encoding were wrong in any way, a genuinely valid
proof would fail that real pairing check — which is exactly what makes it worth
running before trusting a hand-rolled encoding.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `error: TotalMismatch { computed: N, claimed: M }` | `--total` is not the sum of `history.json` | recompute; or the history is missing a payment |
| `error: PaymentExceedsLimit { amount: N, limit: M }` | one `period_index` groups more than `limit_per_period` | check the period assignment |
| `error: TooManyPayments { given: 9, max: 8 }` | more than 8 payments | batch, or raise `MAX_PAYMENTS` and re-`setup` (see [Capacity](zk-solvency-design.md#capacity-max_payments--8)) |
| `error: missing --total` | omitted a required flag | add it; every flag is mandatory |
| `the trait bound ChaCha20Rng: ed25519_dalek::rand_core::CryptoRng is not satisfied` when building `end_to_end` | a transitive `ed25519-dalek` 3.x resolved, which `soroban-env-host` 22 cannot use | `cargo update -p ed25519-dalek@3.0.0 --precise 2.2.0`, then retry |
| `INVALID` from `verify` | proof and verifying key are from different `setup` runs | regenerate with a matching `pk.bin`/`vk.bin` pair |
| `INVALID` on-chain but `VALID` locally | the channel's `limit_per_period` or `total_spent` differs from the proof's public inputs | re-prove against the channel's current values |
| `solvency vk must have exactly 3 gamma_abc_g1 entries` | the key is for a different circuit | re-run `setup` with this crate |
| `not the solvency vk admin` | a different address installed the key first | rotation is permanent for that deployment; the first caller is the admin |
| transaction reverts with `InvalidInput` on corrupt proof bytes | host input validation, not a `false` result | treat a revert as a rejection |

---

## Where the pieces live

| Thing | Path |
| --- | --- |
| This walkthrough | `docs/zk-solvency-walkthrough.md` |
| Design and threat model | `docs/zk-solvency-design.md` |
| Circuit | `zk/solvency_proof/src/circuit.rs` |
| Prover/verifier library | `zk/solvency_proof/src/lib.rs` |
| This guide's CLI | `zk/solvency_proof/src/bin/prover.rs` |
| Encoding bridge | `zk/solvency_proof/src/soroban_encoding.rs` |
| On-chain entry points | `contracts/payment_channel/src/lib.rs` (`set_solvency_vk`, `verify_solvency_proof`) |
| No-network acceptance test | `zk/solvency_proof/tests/end_to_end.rs` |
