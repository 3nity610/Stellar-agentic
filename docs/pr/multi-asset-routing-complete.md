# Deterministic multi-asset payment routing

Closes #394

## Summary

This PR lets an agent pay from the asset held by its channel while the
recipient receives a different requested asset. It discovers direct, AMM,
Stellar path-payment-adapter, and bounded multi-hop candidates; returns the
chosen route and cost before signing; and executes the route atomically with an
end-to-end oracle/slippage floor.

TypeScript and Python use the same integer-only selector and generated fixture
corpus. Identical normalized routes and policy inputs produce the same scores,
tie-break order, and winner in both implementations.

The six phases are retained as reviewable commits in this combined PR:

1. `feat(core): add multi-asset route discovery`
2. `feat(math): add deterministic cross-language route selection`
3. `feat(contracts): execute atomic multi-hop payment routes`
4. `feat(core): quote and execute selected payment routes`
5. `feat(ui): preview routed payment cost before confirmation`
6. `docs(routing): document guarantees and failure modes`

## What changed

### Route discovery

- Adds venue-neutral `RouteHop`, `RouteQuote`, request, provider, oracle, and
  diagnostic types.
- Enumerates same-asset direct routes, AMM direct/multi-hop routes, and classic
  Stellar path-payment candidates.
- Bounds depth and candidate count, enforces allowed intermediates, rejects
  amount/asset discontinuity and cycles, deduplicates canonical routes, and
  removes expired quotes.
- Isolates a failed provider or AMM pair so another venue can still win.
- Uses the oracle only as independent fair-value/reliability/expiry data, never
  as executable liquidity.

### Deterministic selection

- Adds `math/routing.ts` with fixed integer weights for cost, slippage,
  reliability shortfall, and economic depth.
- Defines a total tie-break order: score, output descending, slippage, depth,
  then canonical ID in UTF-8 byte order.
- Performs no I/O, clock reads, floating point, randomization, locale
  collation, or input-order-dependent comparison.
- Adds the strict Python port and extends `fixtures/determinism.json` with 27
  routing cases across three policies, including i128 amounts, reversed input,
  exact ties, and non-BMP identifiers.

### Atomic contract execution

- Adds `PaymentChannel.pay_with_route` and bounded `SwapHop` execution.
- Validates quote expiry, route continuity, destination, cycles, venue, depth,
  per-hop floors, channel collateral, and spend limits.
- Applies the configured price oracle once to the end-to-end source/destination
  result.
- Executes every venue inside one Soroban invocation; a failed middle hop
  reverts earlier token transfers, venue state, channel collateral, and spend
  accounting.
- Adds `amm_swap.has_rate` and read-only `amm_swap.quote` for discovery.
- Regenerates and commits the payment-channel contract specification.

### SDK quote and payment integration

- Adds `RoutePlanner` and `StellarAgent.quote()` for a complete pre-commit
  `PaymentQuote` containing route, expected output, output floor, failures,
  score, quote ledger, and expiry.
- Adds automatic routing to `payForAPI()` through `sourceAsset` and
  `recipientAsset`.
- Allows callers to reuse the exact reviewed `PaymentQuote` or pass an explicit
  normalized route override. Intent, amount, policy, minimum, and freshness are
  still enforced.
- Preserves the paired `destAsset`/`minReceived` legacy single-AMM path.
- Exposes the executed route, expected output, and minimum output on `TxResult`.
- Encodes integer base units directly into `Vec<SwapHop>` without a decimal
  round trip.

### CLI and dashboard

- Replaces the CLI placeholder with
  `stellaragent route preview --quote <file> [--confirm]`.
- Validates quote JSON through the production selector and displays the full
  venue path, source/expected/minimum amounts, fee, slippage, reliability,
  score, diagnostics, and expiry before confirmation.
- Adds the routed-payment workflow to the Payments dashboard with source asset,
  recipient asset, and amount inputs.
- Invalidates the displayed quote when any input changes and shows the explicit
  confirmation action only after a route and costs are visible.

### Documentation

- Adds `docs/payment-routing.md` with provider contracts, configuration,
  preview/reuse examples, the exact scoring formula and tie-breaks, CLI usage,
  atomicity, deployment requirements, operational guidance, and failure modes.
- Updates the root and core READMEs and regenerates the committed TypeDoc/API
  reports.

## Determinism contract

The default score is:

```text
floor(fee_bps * 5000 / 10000)
+ floor(slippage_bps * 3000 / 10000)
+ floor((10000 - reliability_bps) * 2000 / 10000)
+ (hop_count - 1) * 5
```

Routes above 1,000 bps slippage or below 5,000 bps reliability are excluded by
the default policy. Lower score wins. The remaining tie-breakers are fully
specified and fixture-tested.

## Atomicity evidence

Contract tests execute a two-hop source/intermediate/destination payment and
assert the recipient output and channel accounting. A second test forces the
middle venue below its floor, catches the failure, and then re-reads:

- source, intermediate, and destination token balances;
- first and second venue operation counters;
- channel period spend, lifetime spend, allocation, and collateral.

Every value matches the pre-call baseline, proving partial execution does not
survive the transaction rollback boundary.

## Test coverage

- discovery: direct, AMM, multi-hop, path payment, unavailable venues,
  unavailable oracle, expiry, candidate bounds, deduplication, cycles,
  discontinuity, invalid amounts, and intermediate allow-lists;
- selection: all scoring terms, integer truncation, admission filters, every
  tie-break stage, input reversal, i128-scale amounts, custom policies, and
  UTF-8 ordering;
- parity: every generated routing case in both Vitest and pytest;
- contracts: route shapes, same-asset behavior, expiry, depth, cycles,
  continuity, oracle floor, end-to-end minimum, success, and rollback;
- SDK: quote lifecycle, no-route diagnostics, route reuse, stale quotes,
  overrides, encoding, automatic routing, and `TxResult` metadata;
- surfaces: seven CLI tests, six dashboard routing unit tests, and three
  Playwright payment-preview flows.

## Verification

Verified locally with:

```sh
pnpm turbo run lint typecheck test build
pnpm --filter @stellaragent/core test:coverage
pnpm fixtures:check
pnpm docs:api:check
pnpm contract-types:check

cd contracts
PATH="$HOME/.cargo/bin:$PATH" ./generate-specs.sh --check
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all

cd ../python
.venv/bin/pytest -q
.venv/bin/ruff check .
.venv/bin/mypy
```

## Review guide

Suggested review order follows the phase commits:

1. `packages/core/src/routing/`
2. `packages/core/src/math/routing.ts`, `python/src/stellaragent/routing.py`,
   and the shared routing fixtures
3. `contracts/payment_channel/src/lib.rs` and `contracts/amm_swap/src/lib.rs`
4. `packages/core/src/routing/planner.ts`, `agent/StellarAgent.ts`,
   `agent/mutations.ts`, and `agent/encoding.ts`
5. `packages/cli/src/index.ts` and the dashboard payment preview
6. tests and `docs/payment-routing.md`

## Compatibility and deployment notes

- `pay()` and the existing single-AMM `pay_with_conversion()` entrypoints are
  unchanged.
- The channel remains funded, limited, and accounted in one source asset.
- Named assets need `assetContracts` mappings to Stellar Asset Contract IDs.
- Every executable AMM or path-payment hop needs a Soroban `C...` adapter
  implementing `execute_swap`.
- The payment channel must have its end-to-end price oracle configured before
  cross-asset route execution.
- Determinism starts after quote normalization; separate hosts must use the same
  venue/oracle snapshot to receive identical inputs.
