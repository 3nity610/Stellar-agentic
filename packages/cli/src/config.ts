import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Network, ContractAddresses } from '@stellaragent/core';
import { resolveContracts } from '@stellaragent/core';

export interface CliConfig {
  defaultNetwork?: Network;
  networks?: Partial<Record<Network, {
    rpcUrl?: string;
    networkPassphrase?: string;
    contracts?: Partial<ContractAddresses>;
    secretKey?: string;
  }>>;
}

export function getConfigPath(): string {
  return join(homedir(), '.stellaragent', 'config.json');
}

export async function readConfigFile(): Promise<CliConfig> {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return { defaultNetwork: 'testnet', networks: {} };
  }
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as CliConfig;
  } catch {
    return { defaultNetwork: 'testnet', networks: {} };
  }
}

export async function writeConfigFile(config: CliConfig): Promise<void> {
  const path = getConfigPath();
  const dir = join(homedir(), '.stellaragent');
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Resolves contract and network options according to precedence:
 * 1. CLI flags
 * 2. Environment variables (STELLARAGENT_*)
 * 3. Config file (~/.stellaragent/config.json)
 * 4. Built-in defaults
 */
export async function resolveCliNetworkConfig(
  network: Network,
  cliOverrides?: { contracts?: Partial<ContractAddresses>; rpcUrl?: string }
) {
  const fileConfig = await readConfigFile();
  const networkConfig = fileConfig.networks?.[network];

  const mergedContracts = {
    ...(networkConfig?.contracts ?? {}),
    ...(cliOverrides?.contracts ?? {}),
  };

  const contracts = resolveContracts(network, mergedContracts);
  const rpcUrl =
    cliOverrides?.rpcUrl ??
    process.env[`STELLARAGENT_${network.toUpperCase()}_RPC_URL`] ??
    process.env.STELLARAGENT_RPC_URL ??
    networkConfig?.rpcUrl ??
    (network === 'testnet'
      ? 'https://soroban-testnet.stellar.org'
      : network === 'mainnet'
      ? 'https://soroban-rpc.mainnet.stellar.org'
      : 'http://localhost:8000/soroban/rpc');

  return { network, contracts, rpcUrl };
}
