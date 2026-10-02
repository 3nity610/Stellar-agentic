# Determinism Guarantee

This document explains the cross-language determinism guarantee, how it works, and how to maintain it.

## Overview

StellarAgent's core math modules (fixed-point arithmetic, bid scoring, routing) must produce **byte-identical output** across TypeScript, Python, and Rust implementations. This is not a nice-to-have — it is a hard requirement because:

1. **On-chain hash agreement**: Agent bid scores are hashed on-chain. If two implementations disagree on a score, they disagree on the hash, and the transaction fails.
2. **Cross-platform consistency**: IEEE-754 doubles round differently on x86 (SSE2) and ARM (NEON). The same expression can produce different results on different machines.
3. **Mixed-language ecosystems**: A TypeScript agent and a Python agent must agree on which bid wins, or they will make different decisions.

The determinism guarantee is enforced through `fixtures/determinism.json`, a generated file containing 643+ test cases that all three implementations must match exactly.

## How It Works

### The Reference Implementation

The TypeScript implementation in `packages/core/src/math/` is the **reference implementation**. This is because:

- It was the first implementation
- The on-chain bid scores were computed against it
- It uses `bignumber.js`, which has well-defined rounding behavior

### The Fixtures File

`fixtures/determinism.json` is generated from the TypeScript implementation by `scripts/generate-fixtures.ts`. It contains:

- **Fixed-point cases**: arithmetic, formatting, stroop conversions, comparisons
- **Bid cases**: scoring, ranking, spend limits, invalid weight validation
- **Routing cases**: route ranking under different policies
- **Error cases**: inputs both implementations must reject

Each case includes:
- Input values
- Expected output (as strings, never numbers)
- For errors, a flag indicating the call should throw

### The Enforcement Mechanism

Three test suites assert against the same fixtures file:

| Language | Test File | Command |
|----------|-----------|---------|
| TypeScript | `packages/core/src/math/__tests__/determinism-fixtures.test.ts` | `pnpm --filter @stellaragent/core test` |
| Python | `python/tests/test_determinism.py` | `pytest` |
| Rust | `sdk/rust/tests/determinism.rs` | `cargo test --test determinism` |

The CI job `Determinism (TS ↔ Python ↔ Rust)` runs all three suites in a single job. If any implementation diverges, the job fails.

**Comparison is string equality, never numeric closeness.** `pytest.approx` or similar would defeat the entire point — "close enough" is precisely what makes two implementations pick different winners.

## Working with Fixtures

### Regenerating Fixtures

When you change the TypeScript math implementation:

```bash
pnpm fixtures:generate
```

This runs `scripts/generate-fixtures.ts`, which:
1. Executes every case through the TypeScript implementation
2. Serialises the results to `fixtures/determinism.json`
3. Prints a summary of how many cases were generated

### Checking Fixture Freshness

Before committing, verify the fixtures are up to date:

```bash
pnpm fixtures:check
```

This command:
1. Compares the committed `fixtures/determinism.json` against what would be generated now
2. Exits with an error if they differ
3. Prints instructions to regenerate if needed

The CI job runs this check first — if the committed file is stale, the job fails before any tests run.

### When to Regenerate

**Regenerate fixtures when:**
- You add a new math function and add test cases for it in `scripts/generate-fixtures.ts`
- You change the behavior of an existing function intentionally
- You fix a bug that changes numeric output

**Do NOT regenerate when:**
- You only change test code (not the implementation)
- You add a new function but don't add it to the fixtures yet
- The change is a refactor that preserves behavior (verify with `pnpm fixtures:check`)

## Reviewing Fixture Changes

A diff in `fixtures/determinism.json` means the numeric contract changed. In review:

### What to Look For

1. **Expected changes**: If you modified a function's behavior, the diff should show exactly the cases that moved. Review that the new outputs are correct.

2. **Unexpected changes**: If you didn't intend to change behavior but fixtures moved, you likely introduced a regression. Investigate the implementation change.

3. **Case additions**: If you added new test cases, verify they cover the edge cases you intended.

4. **Case removals**: Generally avoid removing cases unless they're truly redundant. More cases = better coverage.

### Example Legitimate Change

You fix a rounding bug in `pct()`:

```diff
- "pct(1.45, 5.00)": "0.290000000000000000"
+ "pct(1.45, 5.00)": "0.290000000000000001"
```

This is legitimate if the bug fix was intentional and the new value is mathematically correct.

### Example Suspicious Change

You only refactored variable names but:

```diff
- "add(0.1, 0.2)": "0.300000000000000000"
+ "add(0.1, 0.2)": "0.300000000000000001"
```

This suggests the refactor accidentally changed behavior. Investigate.

## Updating Other Implementations

When fixtures change legitimately, you must update the other implementations to match:

### Python

1. Run the failing test: `pytest python/tests/test_determinism.py -v`
2. Identify which cases fail
3. Update the corresponding functions in `python/src/stellaragent/fixed_point.py` or `bid.py`
4. Re-run until all pass
5. Verify with `pytest python/tests/test_determinism.py`

### Rust

1. Run the failing test: `cargo test --test determinism`
2. Identify which cases fail
3. Update the corresponding functions in `sdk/rust/src/math/`
4. Re-run until all pass
5. Verify with `cargo test --test determinism`

## Adding New Test Cases

To add coverage for a new function or edge case:

1. Edit `scripts/generate-fixtures.ts`
2. Add your case to the appropriate array (e.g., `fixedPointCases`, `scoreBidCases`)
3. Run `pnpm fixtures:generate` to include it in the fixtures
4. Implement the function in all three languages
5. Verify all suites pass

Example:

```typescript
// In scripts/generate-fixtures.ts
addCase('myNewFunction', ['1.5', '2.5'], 'decimal');
```

## CI Integration

The determinism check is a required CI gate:

- **Job**: `Determinism (TS ↔ Python ↔ Rust)` in `.github/workflows/ci.yml`
- **Steps**:
  1. `pnpm fixtures:check` — ensures fixtures are up to date with TypeScript
  2. TypeScript suite — validates TypeScript implementation
  3. Python suite — validates Python implementation
  4. Rust suite — validates Rust implementation

All three must pass for PRs to merge.

## Troubleshooting

### Fixtures Check Fails

```
error: fixtures/determinism.json is out of date with the TypeScript
       implementation. Regenerate with `pnpm fixtures:generate` and review
       the diff — it means the numeric contract changed.
```

**Cause**: You changed the TypeScript implementation but didn't regenerate fixtures.

**Fix**: Run `pnpm fixtures:generate`, review the diff, and commit the updated file if the change was intentional.

### One Language Fails

If TypeScript passes but Python or Rust fails:

1. The other implementation has a bug or divergence
2. Compare the failing case's output against the fixture
3. Debug the implementation to match the reference

### All Languages Fail

If all three fail with the same case:

1. The fixture itself may be wrong (e.g., a typo in the expected value)
2. Regenerate fixtures: `pnpm fixtures:generate`
3. If the new value is different, review whether the implementation or fixture was correct

## References

- **Generation script**: `scripts/generate-fixtures.ts`
- **TypeScript tests**: `packages/core/src/math/__tests__/determinism-fixtures.test.ts`
- **Python tests**: `python/tests/test_determinism.py`
- **Rust tests**: `sdk/rust/tests/determinism.rs`
- **CI job**: `.github/workflows/ci.yml` (determinism job)
- **Contributing guide**: `CONTRIBUTING.md` (Cross-language determinism section)
