# resolveAssetContract

Resolves a friendly asset code (e.g. `USDC`) to its Soroban contract ID.

XLM is resolved natively. Other assets are resolved via an explicit
`assetContracts` mapping or the built-in well-known asset registry.

## Signature

```ts
function resolveAssetContract(
  asset: string,
  options?: {
    network?: "public" | "testnet" | "futurenet";
    assetContracts?: Record<string, string>;
  },
): string;
```

## Parameters

- `asset` — Friendly asset code, case-insensitive (e.g. `USDC`, `xlm`).
- `options.network` — One of `public`, `testnet`, or `futurenet`.
- `options.assetContracts` — Explicit override map of asset code to contract ID.

`assetContracts` always wins over the built-in registry.

## Returns

The Soroban contract ID for the asset as a string.

## Examples

```ts
import { resolveAssetContract } from "@stellaragent/core";

// USDC on testnet works out of the box.
const usdc = resolveAssetContract("USDC", { network: "testnet" });

// Explicit override wins.
const custom = resolveAssetContract("USDC", {
  network: "testnet",
  assetContracts: { USDC: "CCUSTOM..." },
});
```

## Well-known asset registry

The registry lives in `packages/core/src/assets.ts` as `WELL_KNOWN_ASSETS`.
It is keyed by network and then by uppercase asset code. To add a new
well-known asset, add an entry to the appropriate network block.

## Errors

Throws a clear error when the asset is unknown and no explicit mapping is
provided.
