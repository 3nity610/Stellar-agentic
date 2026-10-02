# Deterministic multi-asset payment routing

StellarAgent can debit a payment channel in the asset the agent holds and
atomically settle the recipient in a different asset. The SDK discovers
candidate routes, normalizes every quote into integer base units, ranks the
candidates without floating-point arithmetic, and returns the complete route
and end-to-end output floor before anything is signed.

This guide covers the discovery contract, deterministic algorithm, SDK and CLI
usage, contract execution boundary, failure modes, and the guarantees that
cross-language fixture parity does and does not provide.

## End-to-end flow

1. `RoutePlanner` asks every configured provider for candidates concurrently.
2. Each provider returns one or more continuous arrays of `RouteHop` objects.
3. Discovery validates amounts, asset continuity, cycles, maximum depth,
   allowed intermediates, quote expiry, fees, slippage, and reliability.
4. An optional oracle reference increases quoted slippage when venue output is
   below fair value and lowers reliability or expiry when the reference is more
   conservative. The oracle is never treated as executable liquidity.
5. `rankRoutes()` applies the same integer policy in TypeScript and Python.
6. `quote()` returns the winner, expected output, minimum output, selector
   score, diagnostics for unavailable venues, and the last valid ledger.
7. Passing that `PaymentQuote` to `payForAPI()` revalidates intent, policy,
   minimum output, and freshness before encoding the route.
8. `PaymentChannel.pay_with_route` executes every hop inside one Soroban
   invocation. Any failed hop or violated floor reverts the whole transaction.

The channel spend limit and collateral accounting remain denominated in the
source/channel asset. Only the recipient settlement asset changes.

## Amount and quote model

All normalized routing amounts are canonical, non-negative integer strings in
Stellar's seven-decimal base units. For example, `"1.2500000"` is represented
as `"12500000"`. JavaScript `number` values and binary floating-point math are
not part of discovery, scoring, quote flooring, or contract encoding.

A `RouteQuote` contains:

- source/destination asset identifiers and source amount;
- expected destination amount;
- total fee and expected slippage in basis points;
- reliability from `0` through `10_000`;
- economic hop count;
- ordered executable hops;
- optional last valid ledger.

Each `RouteHop` records the venue type and stable venue identifier, its input
and expected output, fee amount, fee/slippage/reliability basis points, an
optional per-hop output floor, and an optional classic path-payment path.

`PaymentQuote` adds the caller's end-to-end `minimumDestinationAmount`, the
quote ledger, final expiry ledger, selector score breakdown, and provider
failure diagnostics. It is the pre-commit artifact to display, retain, and pass
back unchanged when submitting.

## Route providers

### Direct

`DirectRouteProvider` emits a zero-fee, zero-slippage, maximum-reliability route
only when source and destination assets are identical. On-chain it is encoded
as an empty route and transfers the channel token directly.

### AMM

`AmmRouteProvider` walks a declared directed pair graph. It can produce direct
and bounded multi-hop routes, skips a pool whose quote callback fails, rejects
cycles, and never traverses an intermediate outside `allowedIntermediates` when
that allow-list is present.

The callback is responsible for reading the venue and returning an executable
quote. `amm_swap.has_rate()` and read-only `amm_swap.quote()` are provided for
the bundled contract. A production DEX integration should expose equivalent
data through its adapter.

### Stellar path payment

`StellarPathPaymentProvider` adapts Horizon strict-send path discovery or a
compatible quote service. The embedded path contributes to economic depth, so
a path with two intermediate assets counts as three hops for admission and
penalty purposes.

The execution `venueId` must be a Soroban `C...` adapter implementing:

```text
execute_swap(from_token, from_amount, to_token, min_out, to) -> i128
```

Horizon is a quote source, not a contract address. Deploy or configure an
execution adapter and return its contract ID as `venueId`; a string such as
`"horizon:testnet"` is appropriate for quote-only fixtures but is rejected by
SDK contract encoding.

### Custom provider

`CallbackRouteProvider` supplies a small adapter for application-specific
venues. Provider failures are isolated. A failed provider appears in
`PaymentQuote.failures`; it stops the payment only when no admissible route from
another provider remains.

### Oracle reference

A `RoutePriceOracle` returns fair expected output, reliability, and optionally
an expiry. If venue output is below the reference, discovery calculates that
shortfall in basis points and uses it as a lower bound on route slippage. It
also takes the lower reliability and earlier expiry. An unavailable oracle is
reported as a diagnostic while executable routes remain candidates.

The payment contract independently checks its configured oracle at execution
time. This protects the final source-to-destination result rather than applying
an unrelated price bound at every intermediate hop.

## Configuration

Create venue adapters once and pass them through `StellarAgentConfig.routing`:

```typescript
import {
  AmmRouteProvider,
  DirectRouteProvider,
  StellarAgent,
  StellarPathPaymentProvider,
} from '@stellaragent/core';

const agent = await StellarAgent.create({
  network: 'testnet',
  assetContracts: {
    USDC: process.env.USDC_TOKEN_CONTRACT!,
    AQUA: process.env.AQUA_TOKEN_CONTRACT!,
  },
  routing: {
    providers: [
      new DirectRouteProvider(),
      new AmmRouteProvider({
        venueId: process.env.AMM_ADAPTER_CONTRACT!,
        pairs: [
          { sourceAsset: 'XLM', destinationAsset: 'USDC' },
          { sourceAsset: 'XLM', destinationAsset: 'AQUA' },
          { sourceAsset: 'AQUA', destinationAsset: 'USDC' },
        ],
        quote: async (pair, sourceAmount) => quoteAmm(pair, sourceAmount),
      }),
      new StellarPathPaymentProvider({
        quote: async (request) => quoteStrictSendPaths(request),
      }),
    ],
    oracle: {
      id: 'reference-prices',
      quote: async (request) => quoteReferencePrice(request),
    },
    maxHops: 3,
    maxCandidates: 32,
    quoteValidityLedgers: 20,
    defaultSlippageToleranceBps: 100,
  },
});
```

`quoteAmm`, `quoteStrictSendPaths`, and `quoteReferencePrice` are application
callbacks. They should return normalized integer values and stable reliability
inputs. Do not insert a wall clock, random tie-break, locale-sensitive sorting,
or a JavaScript floating-point calculation between venue data and the returned
quote.

Every named non-XLM asset used in a route needs a corresponding
`assetContracts` entry. Alternatively, use its `C...` token contract ID as the
asset identifier directly. Every executable hop also needs a `C...` venue
contract ID.

## Preview, reuse, and pay

Request a quote before confirmation:

```typescript
const quote = await agent.quote({
  sourceAsset: 'XLM',
  destinationAsset: 'USDC',
  amount: '25.0000000',
  allowedIntermediates: ['AQUA'],
  slippageToleranceBps: 75,
});

console.log({
  route: quote.route.hops,
  expected: quote.route.expectedDestinationAmount,
  minimum: quote.minimumDestinationAmount,
  feeBps: quote.route.totalFeeBps,
  slippageBps: quote.route.expectedSlippageBps,
  reliabilityBps: quote.route.reliabilityBps,
  validUntilLedger: quote.validUntilLedger,
});
```

Submit the exact reviewed quote:

```typescript
const result = await agent.payForAPI({
  endpoint: 'https://provider.example/inference',
  recipient: 'G...PROVIDER',
  amount: '25.0000000',
  sourceAsset: 'XLM',
  recipientAsset: 'USDC',
  route: quote,
});

console.log(result.route?.id);
console.log(result.expectedDestinationAmount);
console.log(result.minimumDestinationAmount);
```

The SDK checks the reusable quote against the current source asset,
destination asset, amount, policy, minimum, and ledger. A stale or mismatched
quote is not silently replaced with a different route.

For automatic discovery at submission time, omit `route`:

```typescript
await agent.payForAPI({
  endpoint: 'https://provider.example/inference',
  recipient: 'G...PROVIDER',
  amount: '25',
  sourceAsset: 'XLM',
  recipientAsset: 'USDC',
  allowedIntermediates: ['AQUA'],
  slippageToleranceBps: 75,
});
```

### Explicit override

A caller with venue-specific knowledge may pass a normalized `RouteQuote`
instead of a `PaymentQuote`. `RoutePlanner.quoteOverride()` does not bypass
validation: it checks intent, amount, expiry, scoring policy, and the same
slippage/reliability admission bounds. The SDK derives the final output floor
before submission.

`minReceived` may be supplied with an automatically selected or reused route.
When it is higher than the tolerance-derived minimum, the explicit minimum
wins. It cannot loosen the configured floor.

### Legacy single-AMM behavior

If no routing providers are configured, the existing paired `destAsset` plus
`minReceived` form still calls `pay_with_conversion`. This preserves existing
integrations while new integrations move to `recipientAsset`, `quote()`, and
`pay_with_route`.

## CLI preview

Serialize a `PaymentQuote` to JSON, then inspect it without confirming:

```bash
stellaragent route preview --quote payment-quote.json
```

The command validates the route with the production selector and displays the
source amount, expected and minimum destination amounts, full venue path,
estimated fee, expected slippage, reliability, score, unavailable venues, and
expiry ledger. Add `--confirm` only after reviewing that output:

```bash
stellaragent route preview --quote payment-quote.json --confirm
```

Confirmation preserves the quote as the artifact to pass to `payForAPI()`; it
does not substitute or re-rank another route.

The dashboard Payments view follows the same sequence: inputs first, selected
route and costs second, explicit confirmation last. Changing any payment input
invalidates the displayed quote.

## Deterministic selection algorithm

The default policy admits routes with at most `1,000` bps expected slippage and
at least `5,000` bps reliability. For each admitted route it calculates:

```text
weighted_cost        = floor(total_fee_bps * 5000 / 10000)
weighted_slippage    = floor(expected_slippage_bps * 3000 / 10000)
weighted_reliability = floor((10000 - reliability_bps) * 2000 / 10000)
depth_penalty        = (economic_hop_count - 1) * 5

score = weighted_cost
      + weighted_slippage
      + weighted_reliability
      + depth_penalty
```

Lower is better. Every value is an integer. Custom policy weights must be
non-negative safe integers summing to exactly `10,000`.

The total tie-break order is:

1. lower score;
2. larger expected destination amount;
3. lower expected slippage;
4. fewer economic hops;
5. canonical route ID in lexicographic UTF-8 byte order.

The last comparison is explicitly UTF-8, not locale collation, JavaScript
UTF-16 ordering, or Python's implicit Unicode ordering. This keeps even
non-BMP identifiers identical between implementations.

Neither selector reads a clock, performs I/O, depends on input order, uses
floating point, or mutates its inputs. Quote acquisition may differ between
hosts if the underlying live venue snapshots differ; determinism means the
same normalized routes and policy always produce the same ordered result.

## Shared TS/Python fixtures

`scripts/generate-fixtures.ts` evaluates routing pools and writes the expected
scores, breakdowns, and order into `fixtures/determinism.json`. Both Vitest and
pytest consume that generated file. Cases cover:

- empty and inadmissible sets;
- obvious winners and exact ties;
- score rounding;
- every tie-break stage;
- input reversal;
- i128-scale destination amounts;
- ASCII case ordering and non-BMP UTF-8 ordering;
- default, cost-only, and reliability-heavy policies.

Regenerate and verify after changing routing math:

```bash
pnpm fixtures:generate
pnpm fixtures:check
pnpm --filter @stellaragent/core test
cd python
.venv/bin/pytest -q
```

A fixture diff is a protocol change. Review TypeScript and Python output
together rather than updating expected JSON by hand.

## Atomic multi-hop execution

`pay_with_route` accepts up to four `SwapHop` values. Before moving funds it
checks:

- positive source amount and non-negative minimum;
- quote ledger has not expired;
- active channel, agent authorization, collateral, and period limit;
- same-asset payments have an empty route;
- cross-asset payments have a non-empty route;
- maximum depth, asset continuity, no identity hop, no asset cycle;
- final hop reaches the requested destination token;
- no hop calls the payment channel as its own venue;
- configured oracle supports the end-to-end source/destination pair.

For each hop the payment channel transfers the current source token to the
venue and invokes `execute_swap`. Intermediate output returns to the payment
channel; final output goes directly to the recipient. The final venue receives
the stricter of its per-hop floor and the end-to-end minimum.

Soroban nested calls and token transfers share the parent transaction rollback
boundary. If a middle venue panics, returns zero, returns below its floor, or
the final amount misses the end-to-end floor, all earlier transfers and all
channel spend/collateral updates revert. Contract tests assert balances and
operation counters on both sides of a forced middle-hop failure.

## Failure modes

| Condition | Result |
| --- | --- |
| One provider times out or one pool is unavailable | Diagnostic retained; other routes continue |
| Every venue returns no liquidity | `NO_ROUTE` |
| Routes exceed policy slippage/reliability bounds | Filtered; `NO_ROUTE` if none remain |
| Oracle quote callback fails | Diagnostic retained; off-chain venue candidates remain |
| Quote ledger has passed | `QUOTE_EXPIRED` before submission or contract revert at execution |
| Override intent/amount differs | `INVALID_ROUTE_OVERRIDE` |
| Asset code has no token contract mapping | `INVALID_ARGUMENT` |
| Venue ID is not a contract address | Route encoding fails |
| Route is discontinuous, cyclic, too deep, or misses destination | Validation failure or contract revert |
| Contract oracle is missing/stale/invalid | Atomic transaction revert |
| Any hop misses its output floor | Atomic transaction revert |

## Operational guidance

- Quote against a consistent ledger snapshot and keep quote lifetimes short
  enough for the venue's liquidity volatility.
- Return the earliest component expiry from provider/oracle adapters.
- Use stable, documented reliability inputs. Reliability is a policy signal,
  not a replacement for output floors.
- Bound `allowedIntermediates`, `maxHops`, and `maxCandidates` for predictable
  RPC work and contract cost.
- Ensure every execution adapter is funded for its possible destination token
  and implements the exact `execute_swap` interface.
- Monitor `NO_ROUTE`, provider diagnostics, quote expiry, route IDs, actual
  destination output, and contract rollback errors.
- Persist the reviewed `PaymentQuote` beside the resulting transaction hash so
  operators can reproduce why the selector chose that route.

## What the guarantees do not mean

- The oracle is independent reference data, not executable liquidity.
- A high reliability value does not guarantee a venue remains liquid until the
  quote expires; contract floors provide the final protection.
- TS/Python parity does not synchronize live RPC responses. It guarantees the
  selector result after inputs have been normalized.
- The bundled AMM is a deterministic adapter/reference implementation, not a
  claim that one venue is always best.
- Cross-asset settlement does not change the channel's source-asset spend
  limit, collateral denomination, or ownership controls.
