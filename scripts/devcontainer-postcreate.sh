#!/usr/bin/env bash
#
# devcontainer `postCreateCommand`, after `scripts/setup.sh` has confirmed the
# toolchain.
#
# Everything here is a *fetch*, not a build: the image ships the toolchain, and
# this pulls the dependency trees into the mounted workspace so the first
# `pnpm test` does not have to download a gigabyte before it can fail on
# something real. The per-workspace lockfiles are honoured, so what lands here
# is the same dependency set CI resolves.
#
# Each step is allowed to fail. A contributor who only touches the TypeScript
# packages should not be blocked by a crates.io outage in services/signer, and
# the inverse too — so a failure is reported and the rest continue, and
# `scripts/setup.sh --ci` is the thing that actually gates.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ -t 1 ]; then
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  GREEN=''; YELLOW=''; DIM=''; RESET=''
fi

step() { printf '\n%s==>%s %s\n' "$GREEN" "$RESET" "$1"; }
skipped() { printf '%s   skipped: %s%s\n' "$YELLOW" "$1" "$RESET"; }
note() { printf '%s   %s%s\n' "$DIM" "$1" "$RESET"; }

PNPM=("$REPO_ROOT/scripts/pnpm")
[ -x "$PNPM" ] || PNPM=(pnpm)

step "TypeScript workspace"
if "${PNPM[@]}" install --frozen-lockfile; then
  note "${PNPM[*]} install --frozen-lockfile"
else
  skipped "pnpm install failed — the JS packages are not ready yet"
fi

step "Playwright browsers"
# The dashboard e2e suite builds and serves the app, so chromium is part of
# "can I run the whole repo here", not a nicety. It is a large download, hence
# a separate step that can fail on its own.
if "${PNPM[@]}" --filter @stellaragent/dashboard exec playwright install --with-deps chromium; then
  note "stored under \$PLAYWRIGHT_BROWSERS_PATH so a container rebuild does not re-download them"
else
  skipped "playwright install failed — 'pnpm --filter @stellaragent/dashboard test' will not run"
fi

step "Rust workspaces"
for workspace in contracts sdk/rust services/signer zk; do
  if [ ! -f "$workspace/Cargo.toml" ]; then
    note "$workspace: no Cargo.toml, skipping"
    continue
  fi
  # `cargo fetch` resolves and downloads without compiling. contracts/ pins its
  # own Cargo.lock precisely so this resolves the reviewed dependency set
  # rather than whatever crates.io published today.
  if (cd "$workspace" && cargo fetch --locked 2>/dev/null) || (cd "$workspace" && cargo fetch); then
    note "$workspace: dependencies fetched"
  else
    skipped "$workspace: cargo fetch failed — its tests will not run yet"
  fi
done

step "Python SDK"
if python3 -m venv /tmp/sa-venv-check 2>/dev/null; then
  rm -rf /tmp/sa-venv-check
  note "python3 available; run: cd python && python -m venv .venv && .venv/bin/pip install -e '.[dev]'"
else
  skipped "python3 -m venv unavailable — install python3-venv (apt) to run the Python suite"
fi

printf '\n%sDevcontainer ready.%s\n' "$GREEN" "$RESET"
printf "%s  pnpm test                    every TypeScript package\n" "$DIM"
printf "%s  cd contracts && cargo test   contracts\n" "$DIM"
printf "%s  cd sdk/rust && cargo test    Rust SDK\n" "$DIM"
printf "%s  cd services/signer && cargo test   signing service\n" "$DIM"
printf "%s  cd python && pytest          Python SDK\n" "$DIM"
printf "%s  ./scripts/setup.sh --ci      confirm the toolchain\n%s\n" "$DIM" "$RESET"
