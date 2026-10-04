#!/usr/bin/env bash
# Runs the full repository test matrix locally (aligned with .github/workflows/ci.yml).
# Skips optional language/browser suites cleanly with a clear message when a toolchain
# is not installed on the host machine (unless --ci is passed).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STRICT_CI=false
for arg in "$@"; do
  if [ "$arg" = "--ci" ]; then
    STRICT_CI=true
  fi
done

banner() {
  printf "\n==> %s\n" "$1"
}

skip_suite() {
  if [ "$STRICT_CI" = true ]; then
    printf "ERROR: %s (required in --ci mode)\n" "$1" >&2
    exit 1
  fi
  printf "SKIP: %s\n" "$1"
}

# 1. TypeScript workspace packages (Turborepo) + determinism fixture check
banner "TypeScript workspace packages (turbo run test)"
pnpm turbo run test   --filter=@stellaragent/core   --filter=@stellaragent/cli   --filter=@stellaragent/react   --filter=@stellaragent/indexer   --filter=@stellaragent/integration-shared   --filter=@stellaragent/mcp-server   --filter=@stellaragent/langchain

banner "Cross-language determinism fixtures check"
pnpm fixtures:check

# 2. Dashboard unit tests + Playwright E2E specs
banner "Dashboard unit tests"
pnpm --filter @stellaragent/dashboard run test:unit

banner "Dashboard Playwright E2E suite"
if pnpm --filter @stellaragent/dashboard exec playwright --version >/dev/null 2>&1; then
  PLAYWRIGHT_CACHE_DIR="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
  if [ "$(uname -s)" = "Darwin" ] && [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
    PLAYWRIGHT_CACHE_DIR="$HOME/Library/Caches/ms-playwright"
  fi
  if [ -d "$PLAYWRIGHT_CACHE_DIR" ] && [ -n "$(ls -A "$PLAYWRIGHT_CACHE_DIR" 2>/dev/null || true)" ]; then
    pnpm --filter @stellaragent/dashboard run test
  else
    skip_suite "Playwright browsers not installed (run 'pnpm --filter @stellaragent/dashboard exec playwright install chromium' to enable dashboard E2E)"
  fi
else
  skip_suite "Playwright CLI not available — skipping dashboard E2E suite"
fi

# 3. Rust suites (contracts, sdk/rust, services/signer)
if command -v cargo >/dev/null 2>&1; then
  banner "Rust Soroban contracts (contracts/)"
  (cd "$ROOT_DIR/contracts" && cargo test --all)

  banner "Rust SDK (sdk/rust/)"
  (cd "$ROOT_DIR/sdk/rust" && cargo test --all-features)

  banner "Rust RemoteSigner service (services/signer/)"
  (cd "$ROOT_DIR/services/signer" && cargo test --workspace --all-features)
else
  skip_suite "Rust toolchain (cargo) not found — skipping contracts/, sdk/rust/, and services/signer/ test suites"
fi

# 4. Python SDK suite (python/)
PYTHON_BIN=""
if [ -x "$ROOT_DIR/python/.venv/bin/pytest" ]; then
  PYTHON_BIN="$ROOT_DIR/python/.venv/bin/pytest"
elif command -v pytest >/dev/null 2>&1; then
  PYTHON_BIN="pytest"
elif command -v python3 >/dev/null 2>&1 && python3 -m pytest --version >/dev/null 2>&1; then
  PYTHON_BIN="python3 -m pytest"
fi

if [ -n "$PYTHON_BIN" ]; then
  banner "Python SDK (python/)"
  (cd "$ROOT_DIR/python" && $PYTHON_BIN -q)
else
  skip_suite "Python pytest not found — skipping python/ test suite (install with 'pip install -e ./python[dev]')"
fi

printf "\nAll available test suites completed successfully.\n"
