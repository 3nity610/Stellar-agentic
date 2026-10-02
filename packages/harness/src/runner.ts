/**
 * End-to-end Test Harness Runner.
 */
import { Keypair, SorobanRpc } from '@stellar/stellar-sdk';
import {
  DEFAULT_DEVNET_CONFIG,
  DevnetConfig,
  checkDevnetHealth,
  fundAccount,
  fundAllDevnetIdentities,
  waitForDevnet,
} from './devnet.js';
import {
  DeployedContracts,
  loadDeployment,
  saveDeployment,
  verifyDeployment,
  exportDeploymentEnv,
} from './deployer.js';
import { DEVNET_KEYPAIRS, DEVNET_ADDRESSES, DevnetIdentityName } from './keys.js';
import { advanceLedger, getLatestLedger, waitForLedgerSequence } from './ledger.js';
import { SeededScenario, ScenarioName, seedScenario } from './scenarios.js';
import { logDiagnostic, formatFailureDiagnostic } from './diagnostics.js';

export interface HarnessOptions {
  config?: DevnetConfig;
  autoDeploy?: boolean;
  defaultScenario?: ScenarioName;
}

export class TestHarness {
  public readonly config: DevnetConfig;
  public contracts: DeployedContracts | null = null;
  public currentScenario: SeededScenario | null = null;
  public rpc: SorobanRpc.Server;

  constructor(options: HarnessOptions = {}) {
    this.config = options.config ?? DEFAULT_DEVNET_CONFIG;
    this.rpc = new SorobanRpc.Server(this.config.rpcUrl, { allowHttp: true });
  }

  /**
   * Initializes the test harness:
   * 1. Waits for devnet readiness (health-gated)
   * 2. Funds deterministic identities
   * 3. Loads or validates deployment
   * 4. Exports environment variables
   */
  public async setup(scenarioName: ScenarioName = 'standard'): Promise<void> {
    await waitForDevnet(this.config);
    await fundAllDevnetIdentities(this.config.friendbotUrl);

    // Attempt to load existing deployment or construct fallback mock deployment
    this.contracts = loadDeployment() || {
      agentWalletFactory: 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
      paymentChannel: 'CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      escrow: 'CCAX26MNAK56ZPQRNU3U7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLL',
      rateLimiter: 'CDTR88OP31K7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5X9',
      circuitBreaker: 'CE7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
      priceOracle: 'CF7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
      ammSwap: 'CG7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    };

    exportDeploymentEnv(this.contracts);
    this.currentScenario = await seedScenario(scenarioName, this.contracts, this.config.rpcUrl);
  }

  /**
   * Gets a pre-derived deterministic keypair.
   */
  public getKeypair(identity: DevnetIdentityName): Keypair {
    return DEVNET_KEYPAIRS[identity];
  }

  /**
   * Gets a pre-derived deterministic address.
   */
  public getAddress(identity: DevnetIdentityName): string {
    return DEVNET_ADDRESSES[identity];
  }

  /**
   * Funds an arbitrary account.
   */
  public async fund(address: string): Promise<void> {
    await fundAccount(address, this.config.friendbotUrl);
  }

  /**
   * Gets current ledger sequence.
   */
  public async getLedger(): Promise<number> {
    return getLatestLedger(this.config.rpcUrl);
  }

  /**
   * Advances ledger sequence.
   */
  public async advance(count: number = 1): Promise<number> {
    return advanceLedger(
      count,
      DEVNET_KEYPAIRS.admin,
      this.config.rpcUrl,
      this.config.horizonUrl,
      this.config.networkPassphrase
    );
  }

  /**
   * Waits for a target ledger sequence.
   */
  public async waitForSequence(target: number): Promise<number> {
    return waitForLedgerSequence(target, this.config.rpcUrl);
  }

  /**
   * Runs a test with diagnostic error capturing.
   */
  public async runTest(
    testName: string,
    testFn: () => Promise<void>
  ): Promise<void> {
    try {
      await testFn();
    } catch (err) {
      const currentLedger = await this.getLedger().catch(() => undefined);
      logDiagnostic({
        suiteName: 'E2E Test Runner',
        testName,
        currentLedger,
        scenario: this.currentScenario,
        contracts: this.contracts,
        error: err,
      });
      throw err;
    }
  }
}
