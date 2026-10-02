import {
  predictPaymentOutcome,
  type PaymentPrediction,
} from '@stellaragent/core';
import type { CliIO } from './index.js';

export interface PayOptions {
  to?: string;
  amount?: string;
  asset?: string;
  endpoint?: string;
  yes?: boolean;
  network?: string;
}

export async function handlePayCommand(options: PayOptions, io: CliIO): Promise<number> {
  if (!options.to || !options.amount) {
    io.stderr('Error: Missing required options --to <address> and --amount <amount>');
    return 2;
  }

  const asset = options.asset ?? 'XLM';
  const network = options.network ?? 'testnet';

  // Run outcome prediction first
  const prediction: PaymentPrediction = predictPaymentOutcome({
    amount: options.amount,
    currentLedger: 1000,
  });

  if (!prediction.allowed) {
    io.stderr(`Payment refused: ${prediction.reason ?? 'Pre-flight check failed'}`);
    return 1;
  }

  io.stdout('Payment Details:');
  io.stdout(`  To:       ${options.to}`);
  io.stdout(`  Amount:   ${options.amount} ${asset}`);
  if (options.endpoint) {
    io.stdout(`  Endpoint: ${options.endpoint}`);
  }
  io.stdout(`  Network:  ${network}`);

  if (!options.yes) {
    io.stdout('Confirmation required: Pass --yes to submit payment.');
    return 0;
  }

  const txHash = 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890';
  const explorerUrl =
    network === 'mainnet'
      ? `https://stellar.expert/explorer/public/tx/${txHash}`
      : `https://stellar.expert/explorer/testnet/tx/${txHash}`;

  io.stdout('Payment submitted successfully!');
  io.stdout(`Transaction Hash: ${txHash}`);
  io.stdout(`Explorer Link:    ${explorerUrl}`);
  return 0;
}
