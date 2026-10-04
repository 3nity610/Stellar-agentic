# Local Devnet & End-to-End Test Harness

StellarAgent includes a **deterministic, health-gated local Devnet and test harness** powered by the official Stellar standalone container, Soroban RPC, Friendbot, and automated contract cross-wiring.

---

## ⚡ Quickstart (One Command)

To stand up the local devnet, deploy all 7 contracts, seed reproducible scenarios, and run the integration test suites:

```bash
pnpm test:e2e
```

---

## 🛠️ Step-by-Step Toolchain Commands

You can also run each phase independently during development:

### 1. Devnet Lifecycle

```bash
# Start the local Soroban container and wait for health checks
pnpm devnet:up

# Check health and latest ledger sequence
pnpm devnet:status

# Fund all deterministic test identities via Friendbot
pnpm devnet:fund

# Stop the container
pnpm devnet:down
```

### 2. Contract Deployment & Cross-Wiring

Deploys and wires `agent_wallet_factory`, `payment_channel`, `escrow`, `rate_limiter`, `circuit_breaker`, `price_oracle`, and `amm_swap`:

```bash
pnpm deploy:contracts --network local --source alice
```

This generates `deployments/local.json` and configures the `STELLARAGENT_LOCAL_*` environment block.

### 3. Scenario Seeding

Seed named scenarios into the live devnet:

```bash
# Baseline: funded Alice/Bob agents, open channel, active escrow
pnpm devnet:seed standard

# Rate-limited state for testing limit exhaustion
pnpm devnet:seed rate_limited

# Disputed escrow job ready for arbiter resolution
pnpm devnet:seed escrow_dispute
```

---

## 🔑 Deterministic Test Identities

All devnet accounts are derived deterministically using SHA-256 seed expansion (`@stellaragent/harness`):

| Name | Role | Public Address |
| :--- | :--- | :--- |
| `admin` | Protocol Deployer & Admin | Derived from seed `admin` |
| `alice` | Primary Test Agent Owner | Derived from seed `alice` |
| `bob` | Worker Agent / Counterparty | Derived from seed `bob` |
| `charlie` | Arbiter / Third Party | Derived from seed `charlie` |
| `oracle` | Price Feed Signer | Derived from seed `oracle` |
| `signer` | Remote KMS Signer Mock | Derived from seed `signer` |

---

## 🧪 Integration Test Suites

Integration tests are gated by `STELLAR_LOCAL_INTEGRATION=1`. The harness sets this automatically:

```bash
# Run Core SDK integration tests against local devnet
pnpm --filter @stellaragent/core test -- src/__tests__/integration.local.test.ts

# Run Indexer integration tests
pnpm --filter @stellaragent/indexer test -- src/__tests__/integration.local.test.ts
```

---

## 🤖 CI Workflow

The end-to-end devnet test suite runs in GitHub Actions:
- **Nightly Schedule**: Runs every morning at 02:00 UTC.
- **On Demand**: Can be triggered manually via `workflow_dispatch`.
- **Label Triggered**: Add the `e2e` or `run-e2e` label to any PR to execute the harness.
- **Diagnostic Uploads**: On failure, Docker container logs, deployment state, and ledger snapshots are saved to workflow artifacts.
