# Contributing to StellarAgent

Thank you for your interest in contributing! StellarAgent is an open-source project and we welcome contributions of all kinds — bug fixes, new features, documentation, tests, and more.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Testing](#testing)
- [Dependency updates](#dependency-updates)
- [How to Contribute](#how-to-contribute)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Good First Issues](#good-first-issues)

---

## Code of Conduct

Be respectful. Be constructive. We're all here to build something great together.

---

## Project Structure

| Directory | Language | What it is |
|-----------|----------|------------|
| `contracts/` | Rust | Soroban smart contracts on Stellar |
| `packages/core/` | TypeScript | `@stellaragent/core` — the SDK developers install |
| `packages/react/` | TypeScript | `@stellaragent/react` — React hooks over the SDK |
| `packages/cli/` | TypeScript | `@stellaragent/cli` — the `stellaragent` command |
| `dashboard/` | React + TypeScript + Tailwind | Business monitoring dashboard |
| `zk/` | Rust | Solvency-proof circuits |
| `docs/` | Markdown | Documentation |

The TypeScript packages are a pnpm workspace driven by Turborepo — run
commands from the repo root, not from inside a package.

---

## Development Setup

### One command first

```bash
./scripts/setup.sh            # check only — reports what is missing, installs nothing
./scripts/setup.sh --install  # check, then add the wasm targets
./scripts/setup.sh --ci       # check only, non-zero exit if anything is missing
```

It checks the whole toolchain — Node, pnpm, Rust with both wasm targets, the
rustfmt/clippy components, Python, the Stellar CLI, and whether dependencies
are installed — and prints the fix under each failure. Run it first; it turns
four different "command not found" failures in four different tools into one
list.

The check that matters most is **`wasm32v1-none`**, the deployable target.
Without it, `cargo build` fails with `can't find crate for 'core'`, which reads
like a broken dependency tree rather than a missing `rustup target add`, and
it is usually the first thing a newcomer hits. Note that
`wasm32-unknown-unknown` is *not* a substitute: under Rust ≥ 1.82 it emits the
`reference-types` feature, which soroban-sdk 22's VM rejects at upload — the
build succeeds and the artifact is simply undeployable.

### No devcontainer? No problem. Don't want to install anything?

Open the repo in a devcontainer-capable editor. `.devcontainer/` pins Node 22,
pnpm 9.15.9, Rust with both wasm targets, Python 3.11 and stellar-cli 25.1.0 —
the same versions CI installs — and its `postCreateCommand` runs
`scripts/setup.sh` before fetching the four dependency trees. You need nothing
on your host but Docker.

The versions here are duplicated in `scripts/setup.sh` and
`.github/workflows/ci.yml`. If you change one, change all three in the same
commit, or the devcontainer quietly stops being a faithful local mirror of CI.

### Prerequisites

If you are installing by hand:

- [Rust](https://rustup.rs/) 1.84+ with the `wasm32v1-none` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli) 25.1.0
- Node.js 20+ (CI runs 22)
- pnpm 9 (the exact version is pinned in `package.json`'s `packageManager`
  field; `./scripts/pnpm <args>` runs it whatever is on your `PATH`)
- Python 3.10+ (CI runs 3.10 – 3.13)
- Git

### Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/stellaragent.git
cd stellaragent

# Confirm the toolchain before anything else
./scripts/setup.sh --install

# Install every workspace package in one shot (pnpm, from the repo root)
pnpm install

# Install pre-commit hooks (optional but recommended)
pnpm prepare

# Run testnet locally (optional)
stellar network start local
```

### Pre-commit hooks

This repo uses husky + lint-staged for fast pre-commit checks. After running `pnpm install`, the hooks are automatically installed via `pnpm prepare`.

The pre-commit hook runs:
- **TypeScript/JavaScript**: eslint --fix and prettier --write on staged files
- **Python**: ruff check --fix and ruff format on staged files
- **Rust**: cargo fmt --check on staged .rs files

These checks are intentionally fast and focus on formatting/linting. Full test runs are left to CI to keep commits fast.

**Opt-out**: If you prefer your own pre-commit setup, you can skip hook installation by not running `pnpm prepare`, or remove the `.husky` directory.

---

## Testing

Run the full repository test matrix (pre-push check aligned with CI) from the repo root with a single command:

```bash
pnpm test          # pre-push check: TS packages, determinism fixtures, dashboard unit + e2e, Rust (contracts, sdk/rust, signer), and Python SDK
pnpm test:packages # TypeScript workspace packages only (turbo run test)
pnpm typecheck     # tsc --noEmit across the workspace
pnpm lint          # eslint across the workspace
```

`pnpm test` invokes `./scripts/test-all.sh`, which runs every suite in `.github/workflows/ci.yml` and skips cleanly with a clear notice if an optional host toolchain (`cargo`, `pytest`, or Playwright Chromium) is not installed locally (pass `pnpm test -- --ci` to fail if any toolchain is absent).

To run one package's suite:

```bash
pnpm --filter @stellaragent/core test
pnpm --filter @stellaragent/core test:watch
```

### Coverage gate on `packages/core/src/math`

`packages/core/src/math` is the correctness-critical part of the SDK — every
agent bid score and spend-limit check flows through it, and its whole reason
for existing is that native floats round differently on x86 and ARM. A
regression there is a silent cross-platform determinism break, not a crash,
so it is gated at **100% line, branch, function and statement coverage**:

```bash
pnpm --filter @stellaragent/core test:coverage
```

CI fails if coverage drops below that. Thresholds live in
[`packages/core/vitest.config.ts`](packages/core/vitest.config.ts). If you add
a helper to `math/`, add tests for it in the same PR.

### Dashboard e2e (Playwright)

```bash
cd dashboard
pnpm exec playwright install chromium   # one-time browser download
pnpm test                               # builds, serves, and runs the specs
pnpm test:ui                            # interactive runner
```

The specs live in [`dashboard/e2e/`](dashboard/e2e/) and run against a
production `vite preview` build, so CI exercises the same bundle that ships.

They run in **mock mode**, set once in
[`playwright.config.ts`](dashboard/playwright.config.ts). That is not a
shortcut around the wiring: mock mode swaps the `StellarAgent` underneath
[`<StellarAgentProvider>`](packages/react/src/StellarAgentProvider.tsx), so
every panel still goes through the same `@stellaragent/react` hooks, the same
polling, and the same loading/empty/error branches it uses against a real
network. The suite needs no deployed contracts and no indexer, and a green run
is evidence the panels are wired — which the old fixture-import version could
never be.

### Where the dashboard's data comes from

`src/lib/mockData.ts` used to back all four built pages directly, which made a
page rendering fixtures indistinguishable from a page rendering chain state.
The pages now read through `dashboard/src/lib/chain/`, and the fixtures moved
one layer down, where a mock *agent* answers the same SDK methods a real one
does.

```text
src/lib/chain/
  config.ts         env + the explicit mock toggle; never throws
  DashboardProvider one StellarAgent, live or mock, and the mode switch
  readOnlySigner.ts a Signer with no key — the dashboard never signs
  panels.ts         the panel hooks, built on @stellaragent/react
  views.ts          chain state -> view models (pure, unit tested)
  paymentFeed.ts    the indexer client
```

Copy [`dashboard/.env.example`](dashboard/.env.example) to `.env.local` to
point it at a deployment. The short version:

| Variable | Why |
|----------|-----|
| `VITE_STELLARAGENT_MODE` | `chain` (default) or `mock`. Nothing else. |
| `VITE_STELLARAGENT_<NETWORK>_PAYMENT_CHANNEL`, `…_ESCROW` | The contracts the panels call. |
| `VITE_STELLARAGENT_VIEWER_KEY` | A funded `G...` account to simulate against. **Not a secret** — read-only calls never sign, and a `S...` key in a `VITE_` variable is inlined into the bundle and served to every visitor. |
| `VITE_STELLARAGENT_AGENTS` | The roster. The contracts are keyed by ID and have no "list every channel" query, so the dashboard cannot discover this. |
| `VITE_STELLARAGENT_JOBS` | Escrow job ids to watch. |
| `VITE_STELLARAGENT_INDEXER_URL` | `@stellaragent/indexer`'s query API — the payment feed's only source. |

Two things worth knowing before you change any of it:

- **Mock mode is never implicit.** It is `?mode=mock` on the URL, the switch
  in the sidebar, or `VITE_STELLARAGENT_MODE=mock` at build time — in that
  precedence order. With none of them, the dashboard reads the chain, and an
  unconfigured one shows a checklist of what is missing rather than rows that
  are not real.
- **Every panel has four states**, rendered by
  `components/dashboard/PanelBoundary.tsx`: `idle` (not configured — a
  sentence, not a spinner), `loading` (`aria-busy`), `ready` (rows, or an
  empty state that says what "empty" means here), and `error` (an alert with
  the message and a retry). A panel that renders only `data.map(...)` shows
  the same blank card for all three of the last three, and an operator cannot
  tell "nothing has happened" from "I am not being told anything".

### Local-network integration tests

`packages/core/src/__tests__/integration.local.test.ts` runs against a Soroban
standalone network and is **skipped by default**. To run it you need a local
network and the contracts deployed:

```bash
stellar network start local
pnpm deploy:contracts --network local --source alice
# export the STELLARAGENT_LOCAL_* values printed by the deploy command
STELLAR_LOCAL_INTEGRATION=1 pnpm --filter @stellaragent/core test
```

The suite funds isolated owner/worker accounts through local friendbot and
exercises agent registration, the complete payment-channel lifecycle,
rate-limit queries, and the complete escrow lifecycle. It uses the native XLM
asset contract, so no custom token deployment is required.

### Rust contracts

```bash
cd contracts
cargo test --all
cargo clippy --all-targets -- -D warnings
cargo fmt --all -- --check
```

### Python SDK

```bash
cd python
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

pytest              # includes the cross-language determinism suite
ruff check .
mypy
```

### Cross-language determinism (TS ↔ Python ↔ Rust)

`packages/core/src/math`, `python/src/stellaragent`, and `sdk/rust/src/math` must produce
**byte-identical** output. [`fixtures/determinism.json`](fixtures/determinism.json)
holds 643+ cases generated from the TypeScript implementation, and all three test
suites assert against that same file.

For detailed documentation on the determinism guarantee, how to work with fixtures,
and what to do when the check fails, see **[docs/determinism.md](docs/determinism.md)**.

Quick reference:

```bash
pnpm fixtures:generate   # regenerate from packages/core (the reference)
pnpm fixtures:check      # fail if the committed file is stale
pnpm fixtures:test       # test generation and --check in temporary directories
```

The generator regression tests use Node's built-in test runner and the existing
`tsx` dependency. They verify deterministic bytes and ordering, plus current,
stale, and missing fixture checks without changing the committed fixture. They
also run in the `Packages (TypeScript)` CI job.

If you change either math implementation:

1. Make the change.
2. Run `pnpm fixtures:check`. If it fails, the numeric contract changed.
3. If that was intended, run `pnpm fixtures:generate` and **review the diff** —
   it shows exactly which values moved.
4. Run both suites and make the other language match.

The `Determinism (TS ↔ Python ↔ Rust)` CI job runs all three steps and is a required
check. Comparison is string equality, never numeric closeness — "close enough"
is precisely what makes two machines disagree about a bid score.

### Contract struct types (generated from WASM)

`getChannel`, `getJob`, `getRateLimitStatus`, and `getAgent` in
[`packages/core/src/index.ts`](packages/core/src/index.ts) decode contract
structs (`Channel`, `Job`, `RateLimit`, `AgentInfo`) into TypeScript. Those
struct shapes are **generated**, in two steps, from the same contract WASM
that gets deployed — not hand-maintained field by field, which is how the
`ChannelInfo`/`RateLimitStatus` decoders previously drifted out of sync with
the contracts and only surfaced as a type error much later (#371).

```bash
cd contracts
./generate-specs.sh          # extract contracts/specs/*.json from the built WASM
./generate-specs.sh --check  # fail if the committed specs are stale

cd ..
pnpm contract-types:generate # regenerate packages/core/.../generated/contract-types.ts
                              # and python/.../generated/contract_types.py from contracts/specs/*.json
pnpm contract-types:check    # fail if either committed file is stale
```

If you change a contract's `#[contracttype]` struct or enum:

1. Make the change and run `cd contracts && ./generate-specs.sh`.
2. Run `pnpm contract-types:generate` from the repo root and **review the
   diff** in `packages/core/src/generated/contract-types.ts` — it shows
   exactly which field appeared, disappeared, or changed type.
3. Update whatever in `packages/core/src/index.ts` (or the Python SDK, once it
   has a decode path of its own) maps the new `Raw*` shape onto the public
   SDK type.

Both checks are required CI jobs (`Contracts (Rust)`'s "Contract specs are up
to date" step, and the `Generated contract types` job) — a struct gaining or
losing a field fails one or the other until the steps above are run and the
diff is reviewed. `scripts/generate-contract-types.ts` only covers the
structs the SDKs actually decode today (`AgentInfo`, `Channel`, `Job`,
`RateLimit`); add a contract there the day another one gains an SDK-facing
struct.

### Shared contract response fixtures

`fixtures/contract-responses.json` holds example `get_agent`, `get_channel`,
`get_job`, and `get_limits` results for both SDKs. The TypeScript invocation
test uses them as mock return values. The Python test checks them against its
generated dataclasses; Python contract RPC methods are still stubs.

After changing one of these contract structs, regenerate the specs and types
as above, then update the corresponding response in the JSON file. Integer
values wider than `u32` are decimal strings, bytes are `0x`-prefixed hex,
optional values use `null`, and unit enums use a one-item array containing
the Rust variant name. Run `pnpm contract-responses:check` to compare every
fixture field and value type with the committed WASM-derived specs. CI runs
this check alongside `contract-types:check`, so adding a struct field requires
the fixture and both SDK shape tests to catch up.

---

## Dependency updates

[`.github/dependabot.yml`](.github/dependabot.yml) opens PRs weekly (Mondays,
07:00 UTC) against all four dependency graphs: the pnpm workspace, the four
separate cargo workspaces (`contracts/`, `sdk/rust/`, `services/signer/`,
`zk/`), `python/`, and every `uses:` in `.github/workflows/`. CI runs on those
PRs like any other.

This exists because of a specific, expensive class of problem: a day lost to
`soroban-env-host` resolving an incompatible `ed25519-dalek`, from an unpinned
cargo graph. Automated updates surface that in a PR with a diff and a CI run
attached, rather than as a mystery in a release branch.

### Triage expectation

- **Within three working days**, either merge or comment. An unattended
  Dependabot PR is indistinguishable from an abandoned one, and it blocks
  every later bump of the same package.
- **Patch bumps in a grouped PR** are a fast read: check the diff is confined
  to the lockfile, then merge. A patch bump that changes a `package.json`
  dependency *range* is not a patch bump — read it.
- **Minor and major bumps are a normal PR, not a rubber stamp.** They arrive
  ungrouped precisely so they are individually reviewable.
- **Never merge a dependency PR with a red required check.** If CI is red
  because of the bump, that is the update telling you something; the fix is a
  follow-up commit in the same PR, not a close.

### Bumps that are decisions, not chores

These are in the config's `ignore` list on purpose. To take one anyway, remove
the entry and say why in the PR description.

| Package | Why it is pinned |
|---------|------------------|
| `bignumber.js` (npm) | `packages/core/src/math`, `packages/cli` and the dashboard's own `deterministic-math.ts` all route monetary arithmetic through it for cross-platform determinism. A minor bump is a numeric-behaviour change until `pnpm fixtures:check` and the determinism job say otherwise. |
| `ed25519-dalek` 3.x (cargo, `contracts/` and `services/signer/`) | `soroban-env-host` declares `>=2.0.0` but does not compile against 3.x. Taking it is a broken build, not a build failure you can triage. |
| `stellar-sdk` minor/major (pip) | The Python math modules must stay byte-identical with `packages/core/src/math` and `sdk/rust/src/math`. Read the bump against `fixtures/determinism.json` (see [Cross-language determinism](#cross-language-determinism-ts--python--rust)). |

`contracts/Cargo.lock` and `services/signer/Cargo.lock` are committed on
purpose — the deployable WASM and the artifact that holds the authority to move
money must build from a dependency set someone reviewed, not from whatever
crates.io published that morning. Dependabot PRs against them show exactly
what moved.

---

## How to Contribute

1. **Find an issue** — Look for [`good first issue`](https://github.com/yourusername/stellaragent/labels/good%20first%20issue) or [`help wanted`](https://github.com/yourusername/stellaragent/labels/help%20wanted) labels.
2. **Comment on the issue** — Let us know you're working on it so we don't duplicate effort.
3. **Fork & branch** — Fork the repo and create a branch: `git checkout -b feat/your-feature-name`
4. **Build & test** — Make sure tests pass before submitting.
5. **Submit a PR** — Fill out the PR template and link the issue.

---

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(sdk): add payForAPI method
fix(contracts): correct rate limiter overflow
docs: update quick start guide
test(contracts): add escrow release tests
chore: update dependencies
```

Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`

---

## Pull Request Process

1. Ensure your branch is up to date with `main`
2. All CI checks must pass (build, lint, tests)
3. At least one maintainer review required
4. Squash commits before merge (maintainer will do this)

---

## Deploying contracts

There are seven Soroban contracts, four need a one-time `initialize`, and
three hold addresses of the others that can only be set once all seven exist.
Do not deploy them by hand — use the script:

```bash
pnpm deploy:contracts --network local --source alice
pnpm deploy:contracts --network local --source alice --dry-run   # preview only
```

It builds every WASM, deploys all seven, initializes them in the required
order, cross-wires the references, and writes `deployments/<network>.json`
plus a matching `.env` block.

Point the SDK at the result with the printed `STELLARAGENT_<NETWORK>_*`
environment variables, or by passing `contracts:` to `StellarAgent.create()`.
An agent created against undeployed contracts throws
`ContractsNotDeployedError` immediately rather than failing later inside an
RPC call.

Full runbook — including the by-hand sequence and the initialization ordering
constraints — is in **[docs/deployment.md](docs/deployment.md)**.

---

## Good First Issues

If you're new to the project, start here:

- **Contracts**: Write unit tests for the `RateLimiter` contract
- **SDK**: Add JSDoc comments to all exported functions
- **Dashboard**: Improve mobile responsiveness of the agent table
- **Docs**: Add a tutorial for deploying contracts to testnet

---

## Python SDK release checklist

- [ ] Bump `version` in `python/pyproject.toml`
- [ ] `cd python && pytest -q && mypy && ruff check ..`
- [ ] `git tag sdk-python-v<version> && git push --tags`

---

## Questions?

Open a [GitHub Discussion](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/discussions) or an issue on the [tracker](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/issues).
