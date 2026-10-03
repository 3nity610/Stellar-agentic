# Next.js SSR example

This minimal App Router application demonstrates that `@stellaragent/react`
can participate in a Next.js server render without touching browser-only
globals during the server pass.

The `Providers` boundary is a Client Component because it owns React state and
effects. Next.js still prerenders that boundary for the initial response; the
agent is constructed only after client hydration.

## Run

From the repository root, build the package first:

```sh
pnpm --filter @stellaragent/react build
```

Then install and run the example:

```sh
cd packages/react/example/nextjs
pnpm install
pnpm dev
```

Open the URL printed by Next.js. The initial server output can render the
provider in its `idle` state; after hydration the provider transitions through
client-side initialization without requiring browser globals at module scope.
