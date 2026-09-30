# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Native compilation dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Enable pnpm matching the repository configuration
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy root workspace and build configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY packages/core ./packages/core
COPY packages/indexer ./packages/indexer

# Install dependencies and compile workspace packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @stellaragent/core build
RUN pnpm --filter @stellaragent/indexer build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Security: non-root user and group
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

ENV NODE_ENV=production

# Copy built artifacts and dependencies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/packages/indexer ./packages/indexer

# Persistent storage directory for SQLite events database
RUN mkdir -p /data && chown -R appuser:appgroup /data /app

USER appuser:appgroup

VOLUME ["/data"]

EXPOSE 3001

ENV INDEXER_DATABASE=/data/stellaragent-events.sqlite
ENV REPORT_DATABASE=/data/stellaragent-reports.sqlite
ENV PORT=3001

ENTRYPOINT ["node", "packages/indexer/dist/cli.js"]
CMD ["tail"]
