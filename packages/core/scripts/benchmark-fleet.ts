import { ChannelAccountPool } from '../src/fleet/channelPool.js';
import { SubmissionQueue } from '../src/fleet/submissionQueue.js';
import { KeypairSigner } from '../src/signer.js';

const payments = Number(process.env.PAYMENTS ?? 400);
const simulatedConfirmationMs = Number(process.env.CONFIRMATION_MS ?? 5);

if (!Number.isInteger(payments) || payments < 1) throw new Error('PAYMENTS must be positive');
if (!Number.isFinite(simulatedConfirmationMs) || simulatedConfirmationMs < 0) {
  throw new Error('CONFIRMATION_MS must be non-negative');
}

async function measure(channels: number) {
  const accounts = Array.from({ length: channels }, () => {
    const signer = KeypairSigner.random();
    return { address: signer.publicKey(), signer };
  });
  const pool = new ChannelAccountPool({ accounts, minSize: channels, maxSize: channels });
  const queue = new SubmissionQueue({
    concurrency: channels,
    maxQueueSize: payments,
    maxAttempts: 1,
  });
  const sequences = new Map(accounts.map((account) => [account.address, 0]));
  const seen = new Set<string>();
  const started = process.hrtime.bigint();

  await Promise.all(Array.from({ length: payments }, () => queue.submit(() => pool.use(async (account) => {
    const next = (sequences.get(account.address) ?? 0) + 1;
    await new Promise((resolve) => setTimeout(resolve, simulatedConfirmationMs));
    const key = `${account.address}:${next}`;
    if (seen.has(key)) throw new Error(`sequence collision: ${key}`);
    seen.add(key);
    sequences.set(account.address, next);
  }))));

  const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  await queue.close();
  await pool.close();
  return {
    channels,
    payments,
    elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
    paymentsPerSecond: Number((payments / elapsedSeconds).toFixed(1)),
    collisions: payments - seen.size,
  };
}

async function main() {
  const baseline = await measure(1);
  const pooled = await measure(8);
  process.stdout.write(`${JSON.stringify({
    node: process.version,
    simulatedConfirmationMs,
    baseline,
    pooled,
    speedup: Number((pooled.paymentsPerSecond / baseline.paymentsPerSecond).toFixed(2)),
  }, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
