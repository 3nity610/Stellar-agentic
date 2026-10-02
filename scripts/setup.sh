#!/usr/bin/env bash
#
# One command that tells a newcomer exactly what is missing before they try
# to build anything.
#
#   ./scripts/setup.sh            # check only — report, install nothing
#   ./scripts/setup.sh --install  # check, then install what is missing
#   ./scripts/setup.sh --ci       # check only, but fail if anything is missing
#                                  (what .github/workflows/ci.yml runs)
#
# Why this exists: CONTRIBUTING.md lists the toolchain, and every part of it is
# checked by a *different* tool that fails somewhere else. The most expensive
# one is the wasm target — `cargo build --target wasm32v1-none` without it
# errors with "can't find crate for `core`", which reads like a broken
# dependency tree rather than a missing `rustup target add`. This script moves
# that failure to the front, where the fix is the message.
#
# Exit codes:
#   0  every required tool is present (and, with --install, was installed)
#   1  something is missing and could not be installed
#
# The versions below are the ones CI actually runs, so a green local run means
# the same thing a green CI run means. Keep the two in step.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Required versions (mirrored from .github/workflows/ci.yml) ────────────────

REQUIRED_NODE_MAJOR=20
REQUIRED_PNPM_MAJOR=9
MIN_RUST_VERSION="1.84.0"
# wasm32v1-none is the *deployable* target. wasm32-unknown-unknown is built
# too, but only as a second opinion — under Rust >= 1.82 it emits
# reference-types, which soroban-sdk 22's VM rejects at upload, so a build
# against it succeeds and produces an artifact that cannot be deployed.
REQUIRED_WASM_TARGETS=("wasm32v1-none" "wasm32-unknown-unknown")
MIN_PYTHON_VERSION="3.10"
# Matches the release CI installs.
STELLAR_CLI_VERSION="25.1.0"

INSTALL=0
CI_MODE=0

for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    --ci) CI_MODE=1 ;;
    -h|--help)
      # The header comment, minus its leading "# " and the shebang.
      sed -n '3,25p' "${BASH_SOURCE[0]}" | sed -e 's/^#\{1,\} \{0,1\}//' -e '/^set -uo/d'
      exit 0
      ;;
    *)
      echo "error: unknown option '$arg' (try --help)" >&2
      exit 1
      ;;
  esac
done

# ── Reporting ─────────────────────────────────────────────────────────────────

MISSING=0
FIXED=0

if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; DIM=''; RESET=''
fi

ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
bad()  { printf '  %s✗%s %s\n' "$RED" "$RESET" "$1"; MISSING=$((MISSING + 1)); }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
note() { printf '    %s%s%s\n' "$DIM" "$1" "$RESET"; }
fixed() { printf '  %s✓%s %s %s(installed)%s\n' "$GREEN" "$RESET" "$1" "$DIM" "$RESET"; FIXED=$((FIXED + 1)); }

section() { printf '\n%s\n' "$1"; }

# `version_at_least HAVE WANT` → true when HAVE >= WANT.
#
# Not `sort -V`: it orders "1.84.0" *after* "1.96.0-nightly" is stripped
# inconsistently, and it reads "3.10.13" as older than "3.10" because the
# shorter one is treated as a bare prefix. Both are real versions this script
# has to accept, so the comparison is done component by component here.
version_at_least() {
  local have="${1%%-*}" want="${2%%-*}"
  local -a a b
  IFS='.' read -r -a a <<< "$have"
  IFS='.' read -r -a b <<< "$want"

  local length=${#a[@]}
  [ "${#b[@]}" -gt "$length" ] && length=${#b[@]}

  local i left right
  for ((i = 0; i < length; i++)); do
    left="${a[i]:-0}"
    right="${b[i]:-0}"
    # Tolerate "3.10" style components with leading zeros or trailing text.
    [[ "$left" =~ ^[0-9]+$ ]] || left=0
    [[ "$right" =~ ^[0-9]+$ ]] || right=0
    if ((10#$left > 10#$right)); then return 0; fi
    if ((10#$left < 10#$right)); then return 1; fi
  done
  return 0
}

# ── Node.js ───────────────────────────────────────────────────────────────────

check_node() {
  section "Node.js"
  if ! command -v node >/dev/null 2>&1; then
    bad "node is not installed"
    note "Install Node ${REQUIRED_NODE_MAJOR}+ from https://nodejs.org, or use nvm:"
    note "  nvm install ${REQUIRED_NODE_MAJOR} && nvm use ${REQUIRED_NODE_MAJOR}"
    return
  fi
  local version major
  version="$(node --version)"
  major="${version#v}"; major="${major%%.*}"
  if [ "$major" -lt "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
    bad "node ${version} — need >= ${REQUIRED_NODE_MAJOR}"
    note "  nvm install ${REQUIRED_NODE_MAJOR} && nvm use ${REQUIRED_NODE_MAJOR}"
    return
  fi
  ok "node ${version}"
}

# ── pnpm ──────────────────────────────────────────────────────────────────────

# The repo pins its pnpm through the `packageManager` field in package.json;
# `scripts/pnpm` prefers that exact version and only then falls back to
# whatever `pnpm` is on PATH.
scripts_pnpm() {
  if [ -x "$REPO_ROOT/scripts/pnpm" ]; then
    "$REPO_ROOT/scripts/pnpm" "$@"
  else
    pnpm "$@"
  fi
}

check_pnpm() {
  section "pnpm"
  local expected="" installed=""
  expected="$(node -e 'process.stdout.write(require("./package.json").packageManager || "")' 2>/dev/null)"
  expected="${expected#pnpm@}"; expected="${expected%%+*}"

  if ! command -v pnpm >/dev/null 2>&1 && [ ! -x "$REPO_ROOT/scripts/pnpm" ]; then
    bad "pnpm is not installed (repo pins ${expected:-9})"
    note "  corepack enable && corepack prepare pnpm@${expected:-9.15.9} --activate"
    note "  — or 'npm i -g pnpm@${expected:-9.15.9}'"
    return
  fi

  installed="$(scripts_pnpm --version 2>/dev/null)"
  if [ -z "$installed" ]; then
    bad "pnpm is on PATH but did not report a version"
    return
  fi

  local major="${installed%%.*}"
  if [ "$major" -lt "$REQUIRED_PNPM_MAJOR" ] 2>/dev/null; then
    bad "pnpm ${installed} — need >= ${REQUIRED_PNPM_MAJOR} (repo pins ${expected:-9})"
    note "  corepack enable && corepack prepare pnpm@${expected:-9.15.9} --activate"
    return
  fi
  ok "pnpm ${installed}${expected:+ (packageManager pins ${expected})}"
}

# ── Rust + wasm targets ───────────────────────────────────────────────────────

check_rust() {
  section "Rust"
  if ! command -v rustc >/dev/null 2>&1; then
    bad "rustc is not installed"
    note "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    return
  fi

  local version
  version="$(rustc --version | awk '{print $2}')"
  if ! version_at_least "$version" "$MIN_RUST_VERSION"; then
    bad "rustc ${version} — need >= ${MIN_RUST_VERSION}"
    note "  rustup update stable"
  else
    ok "rustc ${version}"
  fi

  for component in rustfmt clippy; do
    if rustup component list --installed 2>/dev/null | grep -q "^${component}-"; then
      ok "${component}"
    else
      bad "${component} is not installed"
      note "  rustup component add ${component}"
    fi
  done
}

# The headline check from the issue: verify wasm32v1-none — the target whose
# artifacts actually deploy — and not just "some wasm target".
check_wasm_targets() {
  section "WASM targets"
  if ! command -v rustup >/dev/null 2>&1; then
    bad "rustup is not installed, so wasm targets cannot be added"
    note "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    return
  fi

  local installed
  installed="$(rustup target list --installed 2>/dev/null)"

  for target in "${REQUIRED_WASM_TARGETS[@]}"; do
    if printf '%s\n' "$installed" | grep -qx "$target"; then
      ok "$target"
      continue
    fi
    if [ "$INSTALL" -eq 1 ]; then
      note "adding $target …"
      if rustup target add "$target" >/dev/null 2>&1; then
        fixed "$target"
      else
        bad "$target is missing and 'rustup target add $target' failed"
      fi
    else
      bad "$target is missing"
      if [ "$target" = "wasm32v1-none" ]; then
        note "This is the deployable target. Without it every build fails with"
        note "\"can't find crate for \`core\`\", which does not look like a missing target."
      fi
      note "  rustup target add $target"
    fi
  done
}

# ── Python ────────────────────────────────────────────────────────────────────

check_python() {
  section "Python"
  local python_bin=""
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then python_bin="$candidate"; break; fi
  done
  if [ -z "$python_bin" ]; then
    bad "python3 is not installed"
    note "Install Python ${MIN_PYTHON_VERSION}+ — CI runs 3.10, 3.11, 3.12 and 3.13."
    return
  fi

  local version
  version="$("$python_bin" -c 'import platform; print(platform.python_version())' 2>/dev/null)"
  if [ -z "$version" ]; then
    bad "$python_bin is on PATH but did not report a version"
    return
  fi
  if ! version_at_least "$version" "$MIN_PYTHON_VERSION"; then
    bad "python ${version} — need >= ${MIN_PYTHON_VERSION}"
    return
  fi
  ok "$python_bin ${version} (CI matrix: 3.10 – 3.13)"
}

# ── Stellar CLI ───────────────────────────────────────────────────────────────

check_stellar() {
  section "Stellar CLI"
  if ! command -v stellar >/dev/null 2>&1; then
    bad "stellar is not installed"
    note "Contracts cannot be built, deployed, or read without it. CI pins v${STELLAR_CLI_VERSION}."
    note "  cargo install stellar-cli --version ${STELLAR_CLI_VERSION} --locked --force"
    note "  — or the prebuilt binary:"
    note "    curl -sL -o /tmp/stellar-cli.tar.gz \\"
    note "      https://github.com/stellar/stellar-cli/releases/download/v${STELLAR_CLI_VERSION}/stellar-cli-${STELLAR_CLI_VERSION}-x86_64-unknown-linux-gnu.tar.gz"
    note "    tar -xzf /tmp/stellar-cli.tar.gz -C ~/.cargo/bin && chmod +x ~/.cargo/bin/stellar"
    return
  fi

  local version
  version="$(stellar --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)"
  if [ -z "$version" ]; then
    warn "stellar is installed but did not report a parseable version"
    return
  fi
  if [ "$version" != "$STELLAR_CLI_VERSION" ]; then
    warn "stellar ${version} — CI pins v${STELLAR_CLI_VERSION}"
    note "A different CLI can extract different contract specs, which fails"
    note "'./generate-specs.sh --check' and the contract-types job."
  else
    ok "stellar ${version}"
  fi
}

# ── Workspace state ───────────────────────────────────────────────────────────

check_workspace() {
  section "Workspace"
  if [ ! -f "$REPO_ROOT/pnpm-lock.yaml" ]; then
    bad "pnpm-lock.yaml is missing"
    return
  fi
  if [ -d "$REPO_ROOT/node_modules" ]; then
    ok "node_modules present"
  else
    bad "dependencies are not installed"
    note "  pnpm install --frozen-lockfile"
  fi
  if [ -f "$REPO_ROOT/contracts/Cargo.lock" ]; then
    ok "contracts/Cargo.lock committed (cargo updates show up in diffs)"
  else
    warn "contracts/Cargo.lock is not committed — cargo bumps would be invisible"
  fi
}

# ── Run ───────────────────────────────────────────────────────────────────────

printf '%s\n' "StellarAgent toolchain check"
printf '%s\n' "${DIM}${REPO_ROOT}${RESET}"

check_node
check_pnpm
check_rust
check_wasm_targets
check_python
check_stellar
check_workspace

printf '\n'
if [ "$MISSING" -eq 0 ]; then
  if [ "$FIXED" -gt 0 ]; then
    printf '%s✓ toolchain ready%s (%d installed, everything else already present)\n' "$GREEN" "$RESET" "$FIXED"
  else
    printf '%s✓ toolchain ready%s\n' "$GREEN" "$RESET"
  fi
  printf '%sNext: pnpm install --frozen-lockfile && pnpm test%s\n' "$DIM" "$RESET"
  exit 0
fi

if [ "$INSTALL" -eq 1 ]; then
  printf '%s✗ %d check(s) still failing after --install%s\n' "$RED" "$MISSING" "$RESET"
else
  printf '%s✗ %d check(s) failing%s\n' "$RED" "$MISSING" "$RESET"
  printf '%sRe-run with --install to add the wasm targets automatically.%s\n' "$DIM" "$RESET"
fi
printf '%sEvery fix is printed above, in the order that unblocks the most work.%s\n' "$DIM" "$RESET"
exit 1
