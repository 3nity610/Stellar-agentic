# @stellaragent/cli

Command-line interface for the StellarAgent AI Agent Payment Rails.

## Installation

```bash
pnpm add -g @stellaragent/cli
# or run via npx / pnpm exec
npx stellaragent --help
```

## Configuration & Precedence

Contract and network configuration resolves according to the following precedence (highest priority first):

1. **CLI Flags**: Explicit options passed directly (e.g. `--contracts`, `--network`)
2. **Environment Variables**: `STELLARAGENT_<NETWORK>_<CONTRACT>` or `STELLARAGENT_<CONTRACT>`
3. **Config File**: `~/.stellaragent/config.json` with per-network sections
4. **Built-in Defaults**: Unconfigured fallback placeholders

### Config Commands

```bash
# Print configuration file path
stellaragent config path

# View configuration value
stellaragent config get defaultNetwork

# Set configuration value
stellaragent config set defaultNetwork testnet
```

## Commands

### `route preview`
Validate and preview routed payment quotes:
```bash
stellaragent route preview --quote quote.json [--confirm]
```

### `pay`
Send payments with pre-flight outcome prediction:
```bash
stellaragent pay --to <address> --amount <amount> --asset USDC [--endpoint <url>] [--yes]
```

### `channel`
Manage payment channels:
```bash
# Open channel
stellaragent channel open --recipient <address> --amount 100 [--yes]

# Top up channel
stellaragent channel top-up --channel-id <id> --amount 50 [--yes]

# Check channel status & spend report
stellaragent channel status --channel-id <id> [--json]

# Close channel
stellaragent channel close --channel-id <id> [--yes]
```
