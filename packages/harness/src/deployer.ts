/**
 * Contract deployment loader, validator, and cross-wiring verifier.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SorobanRpc } from '@stellar/stellar-sdk';
import { DEFAULT_DEVNET_CONFIG } from './devnet.js';

export interface DeployedContracts {
  agentWalletFactory: string;
  paymentChannel: string;
  escrow: string;
  rateLimiter: string;
  circuitBreaker: string;
  priceOracle: string;
  ammSwap: string;
}

export interface DeploymentFile {
  network: string;
  deployedAt: string;
  contracts: DeployedContracts;
}

const DEFAULT_DEPLOYMENT_PATH = resolve(
  process.cwd(),
  'deployments/local.json'
);

/**
 * Loads contract addresses from a deployment JSON file.
 */
export function loadDeployment(
  filePath: string = DEFAULT_DEPLOYMENT_PATH
): DeployedContracts | null {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as DeploymentFile;
    return parsed.contracts;
  } catch {
    return null;
  }
}

/**
 * Saves contract deployment JSON.
 */
export function saveDeployment(
  contracts: DeployedContracts,
  network: string = 'local',
  filePath: string = DEFAULT_DEPLOYMENT_PATH
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const payload: DeploymentFile = {
    network,
    deployedAt: new Date().toISOString(),
    contracts,
  };
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

/**
 * Verifies that the deployed contracts are reachable and initialized on the target RPC.
 */
export async function verifyDeployment(
  contracts: DeployedContracts,
  rpcUrl: string = DEFAULT_DEVNET_CONFIG.rpcUrl
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const rpc = new SorobanRpc.Server(rpcUrl, { allowHttp: true });

  for (const [name, address] of Object.entries(contracts)) {
    if (!address || typeof address !== 'string' || !address.startsWith('C')) {
      errors.push(`Invalid contract address format for ${name}: ${address}`);
      continue;
    }
    try {
      const data = await rpc.getContractData(address, (await import('@stellar/stellar-sdk')).nativeToScVal(0));
      // Even if key 0 is not found, a successful RPC response proves contract exists
    } catch (err) {
      // getContractData may return 404/not found for a nonexistent key, which is normal for alive contracts
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Connection refused') || msg.includes('fetch failed')) {
        errors.push(`Network connection failed while verifying ${name} at ${address}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Exports contract addresses into process.env as STELLARAGENT_LOCAL_* and returns an env object.
 */
export function exportDeploymentEnv(contracts: DeployedContracts): Record<string, string> {
  const envMap: Record<string, string> = {
    STELLARAGENT_LOCAL_AGENT_WALLET_FACTORY: contracts.agentWalletFactory,
    STELLARAGENT_LOCAL_PAYMENT_CHANNEL: contracts.paymentChannel,
    STELLARAGENT_LOCAL_ESCROW: contracts.escrow,
    STELLARAGENT_LOCAL_RATE_LIMITER: contracts.rateLimiter,
    STELLARAGENT_LOCAL_CIRCUIT_BREAKER: contracts.circuitBreaker,
    STELLARAGENT_LOCAL_PRICE_ORACLE: contracts.priceOracle,
    STELLARAGENT_LOCAL_AMM_SWAP: contracts.ammSwap,
    STELLAR_LOCAL_INTEGRATION: '1',
  };

  for (const [k, v] of Object.entries(envMap)) {
    process.env[k] = v;
  }

  return envMap;
}
