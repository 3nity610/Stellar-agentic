# @stellaragent/react

React hooks for `@stellaragent/core` — `StellarAgentProvider`,
`useAgent`, `useChannel`, `useJob`, `usePayForAPI`, `useRateLimitStatus`,
and `useSpendReport`. See [`example/`](example/) for a working app.

- **API reference** (generated from this package's TSDoc comments):
  [`docs/api/react`](../../docs/api/react/README.md)
- **Core SDK architecture**: [`docs/architecture/core-modules.md`](../../docs/architecture/core-modules.md)

## Development

```bash
pnpm --filter @stellaragent/react build       # tsup, emits dist/ + .d.ts
pnpm --filter @stellaragent/react test        # vitest
pnpm --filter @stellaragent/react typecheck
pnpm --filter @stellaragent/react lint
```

After changing a public hook's signature or doc comment, regenerate the API
report and reference docs from the repo root:

```bash
pnpm docs:api
```

CI runs `pnpm docs:api:check` and fails if the committed output is stale.
