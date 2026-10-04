/**
 * Deterministic ledger advancement and sequence polling helpers.
 */
import {
  BASE_FEE,
  Keypair,
  Operation,
  SorobanRpc,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { DEFAULT_DEVNET_CONFIG } from './devnet.js';

/**
 * Retrieves the latest ledger sequence from Soroban RPC.
 */
export async function getLatestLedger(
  rpcUrl: string = DEFAULT_DEVNET_CONFIG.rpcUrl
): Promise<number> {
  const rpc = new SorobanRpc.Server(rpcUrl, { allowHttp: true });
  const latest = await rpc.getLatestLedger();
  return latest.sequence;
}

/**
 * Waits until the ledger sequence reaches or exceeds `targetSequence`.
 */
export async function waitForLedgerSequence(
  targetSequence: number,
  rpcUrl: string = DEFAULT_DEVNET_CONFIG.rpcUrl,
  timeoutMs: number = 30_000
): Promise<number> {
  const start = Date.now();
  const rpc = new SorobanRpc.Server(rpcUrl, { allowHttp: true });

  while (Date.now() - start < timeoutMs) {
    try {
      const latest = await rpc.getLatestLedger();
      if (latest.sequence >= targetSequence) {
        return latest.sequence;
      }
    } catch {
      // Continue polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    `Timed out waiting for ledger sequence >= ${targetSequence} (current timeout: ${timeoutMs}ms)`
  );
}

/**
 * Advances the devnet ledger by `count` blocks deterministically.
 * In Soroban standalone devnet, committing transactions immediately advances the ledger.
 */
export async function advanceLedger(
  count: number = 1,
  keypair: Keypair,
  rpcUrl: string = DEFAULT_DEVNET_CONFIG.rpcUrl,
  horizonUrl: string = DEFAULT_DEVNET_CONFIG.horizonUrl,
  passphrase: string = DEFAULT_DEVNET_CONFIG.networkPassphrase
): Promise<number> {
  const rpc = new SorobanRpc.Server(rpcUrl, { allowHttp: true });
  let currentSeq = (await rpc.getLatestLedger()).sequence;
  const targetSeq = currentSeq + count;

  for (let i = 0; i < count; i++) {
    try {
      // Fetch account sequence via RPC / Horizon
      const accountRes = await fetch(
        `${horizonUrl}/accounts/${keypair.publicKey()}`
      );
      if (accountRes.ok) {
        const accountData = (await accountRes.json()) as { sequence: string };
        const account = new (await import('@stellar/stellar-sdk')).Account(
          keypair.publicKey(),
          accountData.sequence
        );

        const tx = new TransactionBuilder(account, {
          fee: BASE_FEE,
          networkPassphrase: passphrase,
        })
          .addOperation(
            Operation.payment({
              destination: keypair.publicKey(),
              asset: (await import('@stellar/stellar-sdk')).Asset.native(),
              amount: '0.0000001',
            })
          )
          .setTimeout(30)
          .build();

        tx.sign(keypair);

        const sendRes = await rpc.sendTransaction(tx);
        if (sendRes.status !== 'ERROR') {
          // Poll for completion
          let attempts = 10;
          while (attempts-- > 0) {
            const status = await rpc.getTransaction(sendRes.hash);
            if (status.status === 'SUCCESS' || status.status === 'FAILED') break;
            await new Promise((r) => setTimeout(r, 200));
          }
        }
      }
    } catch {
      // If transaction submission isn't needed or standalone progresses on time, wait
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const newSeq = (await rpc.getLatestLedger()).sequence;
  return newSeq;
}
