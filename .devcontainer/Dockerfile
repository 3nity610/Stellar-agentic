# syntax=docker/dockerfile:1
#
# Devcontainer image for StellarAgent.
#
# The point of this image is that a contributor can build and test every part
# of the repo — contracts to deployable WASM, the TypeScript workspace, the
# Rust and Python SDKs — with nothing installed on their host beyond Docker and
# an editor. `scripts/setup.sh` checks the same list of tools; this image
# satisfies all of it up front so the check passes on first run.
#
# Versions are pinned to what .github/workflows/ci.yml runs. If you change one
# here, change it there and in scripts/setup.sh in the same commit, or the
# devcontainer stops being a faithful local mirror of CI.

# ── Base: Rust + the wasm targets the contracts need ─────────────────────────
#
# `wasm32v1-none` is the deployable target — wasm32-unknown-unknown builds too
# but emits reference-types under Rust >= 1.82, which soroban-sdk 22's VM
# rejects at upload. Both are installed so `cargo build --target …` for either
# works; see .github/workflows/ci.yml for why the former is the one that matters.
FROM rust:1-bookworm

ARG NODE_MAJOR=22
ARG PNPM_VERSION=9.15.9
ARG STELLAR_CLI_VERSION=25.1.0

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN rustup target add wasm32v1-none wasm32-unknown-unknown \
 && rustup component add rustfmt clippy

# ── Node.js + pnpm ───────────────────────────────────────────────────────────
#
# Node from NodeSource rather than Debian's nodejs package, which on bookworm is
# an old major that does not satisfy the repo's engines field.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg xz-utils \
 && mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update && apt-get install -y --no-install-recommends nodejs \
 && apt-get purge -y gnupg && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g "pnpm@${PNPM_VERSION}" \
 && npm cache clean --force

# ── Python 3.11 ──────────────────────────────────────────────────────────────
#
# Bookworm ships 3.11, which is inside the 3.10–3.13 matrix CI runs. A
# contributor targeting the floor (3.10) should use the CI job rather than
# rebuilding this image.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv build-essential pkg-config libssl-dev \
 && rm -rf /var/lib/apt/lists/*

# ── Stellar CLI ──────────────────────────────────────────────────────────────
#
# From the project's prebuilt release rather than `cargo install`: that
# compiles from source against whatever ethnum version its Cargo.lock pins,
# which for 25.1.0 fails to build under a current stable rustc. Same reasoning
# as the cache/install split in ci.yml.
RUN curl -sL -o /tmp/stellar-cli.tar.gz \
      "https://github.com/stellar/stellar-cli/releases/download/v${STELLAR_CLI_VERSION}/stellar-cli-${STELLAR_CLI_VERSION}-x86_64-unknown-linux-gnu.tar.gz" \
 && tar -xzf /tmp/stellar-cli.tar.gz -C /usr/local/cargo/bin \
 && chmod +x /usr/local/cargo/bin/stellar \
 && rm /tmp/stellar-cli.tar.gz

# ── Non-root user ────────────────────────────────────────────────────────────
#
# devcontainer.json sets `remoteUser: vscode`, and the CLI only creates that
# user implicitly when the field is absent — naming it explicitly means it has
# to exist in the image, or the container fails to start.
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN groupadd --gid ${USER_GID} ${USERNAME} \
 && useradd --uid ${USER_UID} --gid ${USER_GID} -m -s /bin/bash ${USERNAME} \
 && printf 'export PATH=/usr/local/cargo/bin:$PATH\n' > /etc/profile.d/cargo.sh \
 && chmod 644 /etc/profile.d/cargo.sh \
 && chmod -R a+rX /usr/local/cargo /usr/local/rustup \
 && mkdir -p /ms-playwright /workspace \
 && chown -R ${USER_UID}:${USER_GID} /ms-playwright /workspace

# Playwright's browsers live outside the workspace so a container rebuild does
# not re-download ~400 MB of Chromium.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /workspace
