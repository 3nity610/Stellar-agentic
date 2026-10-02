/**
 * Shared Soroban build/simulate/sign/submit pipeline.
 *
 * Agent authorization and transaction sequencing are intentionally separate:
 * authorization entries are signed by `ctx.signer`, while an exclusive channel
 * lease supplies the envelope source/signature. This lets one logical agent use
 * many independent sequence streams without changing on-chain authorization.
 */
import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  SorobanRpc,
  scValToNative,
  xdr,
  type Transaction,
  type FeeBumpTransaction,
} from '@stellar/stellar-sdk';
import { StellarAgentError } from '../errors.js';
import type { StellarAgentErrorCode } from '../errors.js';
import { SigningError } from '../signer.js';
import type { Signer } from '../signer.js';
import type { NetworkConfig, TxResult } from '../types/index.js';
import type { ChannelAccountLease, ChannelAccountPool } from '../fleet/channelPool.js';
import type { FeeStats, FeeStrategy } from '../fleet/feeStrategy.js';
import {
  baseAttributes,
  SpanNames,
  SemConv,
  MetricNames,
  createPaymentId,
  registerPaymentTrace,
  attachTransactionHash,
} from '../telemetry/index.js';
import type { TelemetryContext } from '../telemetry/index.js';

export interface InvocationFeeBumpConfig {
  enabled: boolean;
  mode: 'on_expiry' | 'always';
  signer?: Signer;
  strategy: FeeStrategy;
  triggerAfterAttempts: number;
  expiryThresholdSeconds: number;
  maxBumps: number;
}

/** What {@link runInvocation} needs to build, sign, and submit a Soroban call. */
export interface InvocationContext {
  /** Agent identity used for Soroban authorization entries. */
  signer: Signer;
  rpc: SorobanRpc.Server;
  networkConfig: NetworkConfig;
  address: string;
  telemetry: TelemetryContext;
  channelPool?: ChannelAccountPool;
  feeStrategy: FeeStrategy;
  feeBump: InvocationFeeBumpConfig;
}

/**
 * A bound reference to `StellarAgent`'s private `invokeContract` method —
 * what every query/mutation helper calls through.
 */
export type InvokeFn = (
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  readOnly?: boolean,
) => Promise<{ value: unknown; tx: TxResult }>;

/**
 * Build and simulate every contract call. Mutations additionally sign the
 * simulated auth entries, assemble the footprint/resources, sign and submit
 * the envelope, and wait for a terminal transaction status.
 */
export async function runInvocation(
  ctx: InvocationContext,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  readOnly = false,
): Promise<{ value: unknown; tx: TxResult }> {
  const startMs = Date.now();
  const paymentId = readOnly ? undefined : createPaymentId();
  const attrs = {
    ...baseAttributes(ctx.telemetry),
    [SemConv.contract.id]: contractId,
    [SemConv.contract.method]: method,
    ...(paymentId ? { [SemConv.trace.paymentId]: paymentId } : {}),
  };

  return ctx.telemetry.tracer.startActiveSpan(SpanNames.contractInvoke, attrs, async (parent) => {
    let lease: ChannelAccountLease | undefined;
    let acceptedSequence = false;
    try {
      if (paymentId) {
        registerPaymentTrace({
          paymentId,
          agentAddress: ctx.address,
          method,
          submittedAt: Date.now(),
        });
      }

      // Queries remain simulation-only. Mutations exclusively own a channel
      // from account load until terminal status, preventing sequence races.
      lease = !readOnly && ctx.channelPool ? await ctx.channelPool.lease() : undefined;
      const sourceAddress = lease?.address ?? ctx.address;
      const sourceSigner = lease?.signer ?? ctx.signer;
      const account = await ctx.rpc.getAccount(sourceAddress);
      const operation = new Contract(contractId).call(method, ...args);
      const initialFee = await ctx.feeStrategy.getFee({
        phase: 'initial',
        operationCount: 1,
        minimumFee: BASE_FEE,
        soroban: true,
        getFeeStats: feeStatsLoader(ctx.rpc),
      });
      const transaction = new TransactionBuilder(account, {
        fee: initialFee,
        networkPassphrase: ctx.networkConfig.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      const simulation = await ctx.telemetry.tracer.startActiveSpan(
        SpanNames.simulate,
        attrs,
        async (simulateSpan) => {
          const sim = await ctx.rpc.simulateTransaction(transaction);
          if (SorobanRpc.Api.isSimulationError(sim)) {
            simulateSpan.recordException(new Error(sim.error));
            throw contractError(
              'SIMULATION_FAILED',
              `${method} simulation failed: ${sim.error}`,
            );
          }
          if (SorobanRpc.Api.isSimulationRestore(sim)) {
            throw new StellarAgentError(
              'SIMULATION_FAILED',
              `${method} requires restoring expired ledger entries before invocation`,
            );
          }
          return sim;
        },
      );

      if (!readOnly && simulation.minResourceFee) {
        const feeStroops = Number(simulation.minResourceFee);
        if (Number.isFinite(feeStroops) && feeStroops > 0) {
          ctx.telemetry.metrics.recordHistogram(
            MetricNames.paymentFeesStroops,
            feeStroops,
            { ...attrs, component: 'resource_minimum' },
          );
        }
      }

      if (readOnly) {
        return {
          value: simulation.result?.retval
            ? scValToNative(simulation.result.retval)
            : undefined,
          tx: { hash: '', success: true },
        };
      }

      const validUntilLedgerSeq = simulation.latestLedger + 100;
      const auth = await ctx.telemetry.tracer.startActiveSpan(SpanNames.sign, attrs, async () =>
        Promise.all((simulation.result?.auth ?? []).map(async (entry: xdr.SorobanAuthorizationEntry) => {
          if (entry.credentials().switch().name !== 'sorobanCredentialsAddress') {
            return entry;
          }
          const signedXdr = await ctx.signer.signAuthEntry(entry.toXDR('base64'), {
            networkPassphrase: ctx.networkConfig.networkPassphrase,
            validUntilLedgerSeq,
          });
          return xdr.SorobanAuthorizationEntry.fromXDR(signedXdr, 'base64');
        })),
      );

      const hostFunction = operation.body().invokeHostFunctionOp().hostFunction();
      const authorizedOperation = Operation.invokeHostFunction({ func: hostFunction, auth });
      const authorizedTransaction = TransactionBuilder.cloneFrom(transaction)
        .clearOperations()
        .addOperation(authorizedOperation)
        .build();
      const assembled = SorobanRpc.assembleTransaction(
        authorizedTransaction,
        simulation,
      ).build();
      const signedXdr = await sourceSigner.signTransaction(assembled.toXDR(), {
        networkPassphrase: ctx.networkConfig.networkPassphrase,
      });
      const signed = TransactionBuilder.fromXDR(
        signedXdr,
        ctx.networkConfig.networkPassphrase,
      );
      if (!isInnerTransaction(signed)) {
        throw new StellarAgentError('SUBMISSION_FAILED', 'Signer returned an unexpected fee-bump envelope');
      }

      let currentEnvelope: Transaction | FeeBumpTransaction = signed;
      let feeBumped = false;
      let feeSource: string | undefined;
      let bumps = 0;
      let previousBumpRate: string | undefined;
      let submissionAttempts = 0;

      if (ctx.feeBump.enabled && ctx.feeBump.mode === 'always') {
        const bumped = await buildAndSignFeeBump(ctx, signed, sourceSigner, false);
        currentEnvelope = bumped.envelope;
        feeSource = bumped.feeSource;
        feeBumped = true;
        bumps = 1;
        previousBumpRate = bumped.feeRate;
      }

      const submitted = await ctx.telemetry.tracer.startActiveSpan(
        SpanNames.submit,
        attrs,
        async (submitSpan) => {
          const result = await sendEnvelope(ctx, currentEnvelope, method);
          acceptedSequence = true;
          submissionAttempts += 1;
          submitSpan.setAttribute(SemConv.transaction.hash, result.hash);
          if (paymentId) attachTransactionHash(paymentId, result.hash);
          return result;
        },
      );
      let currentHash = submitted.hash;

      for (let attempt = 0; attempt < 30; attempt += 1) {
        const confirmed = await ctx.rpc.getTransaction(currentHash);
        if (confirmed.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
          await ctx.telemetry.tracer.startActiveSpan(SpanNames.confirm, {
            ...attrs,
            [SemConv.transaction.hash]: currentHash,
            [SemConv.transaction.ledger]: confirmed.ledger,
          }, (confirmSpan) => {
            confirmSpan.end();
          });
          const latencyMs = Date.now() - startMs;
          const feePaid = confirmedFee(confirmed, currentEnvelope);
          ctx.telemetry.metrics.recordHistogram(MetricNames.paymentLatencyMs, latencyMs, attrs);
          ctx.telemetry.metrics.recordHistogram(
            MetricNames.paymentFeesStroops,
            Number(feePaid),
            { ...attrs, component: 'charged' },
          );
          ctx.telemetry.logger.debug(`${method} confirmed`, {
            hash: currentHash,
            ledger: confirmed.ledger,
            latencyMs,
            feePaid,
            feeBumped,
            sourceAccount: sourceAddress,
          });
          return {
            value: confirmed.returnValue ? scValToNative(confirmed.returnValue) : undefined,
            tx: {
              hash: currentHash,
              success: true,
              ledger: confirmed.ledger,
              feePaid,
              feeBumped,
              sourceAccount: sourceAddress,
              feeSource,
              submissionAttempts,
            },
          };
        }
        if (confirmed.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
          const diagnostics = diagnosticText(confirmed.diagnosticEventsXdr);
          throw contractError(
            'TRANSACTION_FAILED',
            `${method} transaction failed${diagnostics ? `: ${diagnostics}` : ''}`,
            currentHash,
          );
        }

        const shouldBump = ctx.feeBump.enabled &&
          ctx.feeBump.mode === 'on_expiry' &&
          bumps < ctx.feeBump.maxBumps &&
          (attempt + 1 >= ctx.feeBump.triggerAfterAttempts ||
            secondsUntilExpiry(signed) <= ctx.feeBump.expiryThresholdSeconds);
        if (shouldBump) {
          const bumped = await buildAndSignFeeBump(
            ctx,
            signed,
            sourceSigner,
            true,
            previousBumpRate,
          );
          const replacement = await sendEnvelope(ctx, bumped.envelope, method);
          acceptedSequence = true;
          submissionAttempts += 1;
          currentEnvelope = bumped.envelope;
          currentHash = replacement.hash;
          feeSource = bumped.feeSource;
          feeBumped = true;
          bumps += 1;
          previousBumpRate = bumped.feeRate;
          if (paymentId) attachTransactionHash(paymentId, replacement.hash);
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      ctx.telemetry.metrics.incrementCounter(MetricNames.submissionExpiries, 1, attrs);
      throw new StellarAgentError(
        'TRANSACTION_TIMEOUT',
        `${method} transaction did not complete in time`,
        { transactionHash: currentHash },
      );
    } catch (error) {
      if (error instanceof StellarAgentError) {
        ctx.telemetry.metrics.incrementCounter(MetricNames.paymentFailures, 1, {
          ...attrs,
          [SemConv.error.code]: error.code,
        });
        parent.recordException(error);
        throw error;
      }
      if (error instanceof SigningError) throw error;
      const wrapped = new StellarAgentError(
        'NETWORK_ERROR',
        `${method} failed while communicating with Soroban RPC: ${errorMessage(error)}`,
        { cause: error },
      );
      parent.recordException(wrapped);
      throw wrapped;
    } finally {
      await lease?.release(acceptedSequence ? 'committed' : 'rolled_back');
    }
  });
}

async function sendEnvelope(
  ctx: InvocationContext,
  envelope: Transaction | FeeBumpTransaction,
  method: string,
): Promise<{ hash: string }> {
  const localHash = envelope.hash().toString('hex');
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await ctx.rpc.sendTransaction(envelope);
      if (result.status === 'PENDING' || result.status === 'DUPLICATE') return result;
      if (result.status !== 'TRY_AGAIN_LATER') {
        const diagnostics = diagnosticText(result.diagnosticEvents);
        throw contractError(
          'SUBMISSION_FAILED',
          `${method} submission failed (${result.status}): ${
            diagnostics || result.errorResult?.toXDR('base64') || 'unknown error'
          }`,
        );
      }
    } catch (error) {
      if (error instanceof StellarAgentError) throw error;
      // A transport can fail after the RPC accepted the bytes. Check the
      // deterministic envelope hash before retrying the exact same sequence.
      try {
        const known = await ctx.rpc.getTransaction(localHash);
        if (known.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
          return { hash: localHash };
        }
      } catch {
        // The retry below is still the same signed envelope and sequence.
      }
      if (attempt === 3) throw error;
    }
    if (attempt < 3) {
      ctx.telemetry.metrics.incrementCounter(MetricNames.submissionRetries, 1);
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1)));
    }
  }
  throw new StellarAgentError('SUBMISSION_FAILED', `${method} submission exhausted retries`);
}

async function buildAndSignFeeBump(
  ctx: InvocationContext,
  inner: Transaction,
  fallbackSigner: Signer,
  replacement: boolean,
  previousBumpRate?: string,
): Promise<{ envelope: FeeBumpTransaction; feeSource: string; feeRate: string }> {
  const signer = ctx.feeBump.signer ?? fallbackSigner;
  const feeSource = await signer.getPublicKey();
  const operationCount = Math.max(1, inner.operations.length);
  const innerRate = (BigInt(inner.fee) + BigInt(operationCount) - 1n) / BigInt(operationCount);
  // Stellar replacement-by-fee requires a materially higher bid. An always-
  // bumped sponsored transaction has not been submitted yet, so matching the
  // assembled inner rate is sufficient; replacements use the documented 10x.
  const replacementBase = previousBumpRate === undefined
    ? innerRate
    : BigInt(previousBumpRate);
  const minimum = replacement ? replacementBase * 10n : innerRate;
  const fee = await ctx.feeBump.strategy.getFee({
    phase: 'fee_bump',
    operationCount: operationCount + 1,
    minimumFee: minimum.toString(),
    previousFee: innerRate.toString(),
    soroban: true,
    getFeeStats: feeStatsLoader(ctx.rpc),
  });
  const bump = TransactionBuilder.buildFeeBumpTransaction(
    feeSource,
    fee,
    inner,
    ctx.networkConfig.networkPassphrase,
  );
  const signedXdr = await signer.signTransaction(bump.toXDR(), {
    networkPassphrase: ctx.networkConfig.networkPassphrase,
  });
  const signed = TransactionBuilder.fromXDR(signedXdr, ctx.networkConfig.networkPassphrase);
  if (isInnerTransaction(signed)) {
    throw new StellarAgentError('SUBMISSION_FAILED', 'Fee payer returned a non-fee-bump envelope');
  }
  return { envelope: signed, feeSource, feeRate: fee };
}

function isInnerTransaction(
  transaction: Transaction | FeeBumpTransaction,
): transaction is Transaction {
  return 'sequence' in transaction && Array.isArray(transaction.operations);
}

function secondsUntilExpiry(transaction: Transaction): number {
  const maxTime = transaction.timeBounds?.maxTime;
  if (!maxTime || maxTime === '0') return Number.POSITIVE_INFINITY;
  return Number(BigInt(maxTime) - BigInt(Math.floor(Date.now() / 1000)));
}

function feeStatsLoader(rpc: SorobanRpc.Server): (() => Promise<FeeStats>) | undefined {
  const candidate = rpc as unknown as { getFeeStats?: () => Promise<FeeStats> };
  return typeof candidate.getFeeStats === 'function'
    ? () => candidate.getFeeStats!()
    : undefined;
}

function confirmedFee(
  confirmed: SorobanRpc.Api.GetSuccessfulTransactionResponse,
  envelope: Transaction | FeeBumpTransaction,
): string {
  try {
    return confirmed.resultXdr.feeCharged().toString();
  } catch {
    // Lightweight RPC fakes often omit resultXdr. The envelope fee is the
    // maximum charge and keeps TxResult useful in those deterministic tests.
    return envelope.fee;
  }
}

/** Maps a raw contract-panic or RPC failure message to a stable machine-readable code. */
export function contractError(
  fallback: StellarAgentErrorCode,
  message: string,
  transactionHash?: string,
): StellarAgentError {
  const mappings: Array<[RegExp, StellarAgentErrorCode]> = [
    [/spend limit exceeded/i, 'SPEND_LIMIT_EXCEEDED'],
    [/channel not found/i, 'CHANNEL_NOT_FOUND'],
    [/channel is closed/i, 'CHANNEL_CLOSED'],
    [/job not found/i, 'JOB_NOT_FOUND'],
    [/job is not open/i, 'JOB_NOT_OPEN'],
    [/job has expired/i, 'JOB_EXPIRED'],
    [/not (?:the )?(?:authorized|assigned)|not authorized/i, 'NOT_AUTHORIZED'],
    [/no rate limit|limit not found/i, 'RATE_LIMIT_NOT_FOUND'],
    [/(?:amount|deposit|limit).*(?:positive|invalid)|deadline must/i, 'INVALID_ARGUMENT'],
  ];
  const code = mappings.find(([pattern]) => pattern.test(message))?.[1] ?? fallback;
  return new StellarAgentError(code, message, { transactionHash });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function diagnosticText(events: xdr.DiagnosticEvent[] | undefined): string {
  if (!events?.length) return '';
  try {
    return events.map((diagnostic) => {
      const event = diagnostic.event();
      return JSON.stringify({
        topics: event.body().v0().topics().map((topic) => scValToNative(topic)),
        data: scValToNative(event.body().v0().data()),
      }, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
    }).join('; ');
  } catch {
    return events.map((event) => event.toXDR('base64')).join('; ');
  }
}

export async function getLatestLedger(rpc: SorobanRpc.Server): Promise<number> {
  try {
    return (await rpc.getLatestLedger()).sequence;
  } catch (error) {
    throw new StellarAgentError('NETWORK_ERROR', 'Unable to read the latest ledger', {
      cause: error,
    });
  }
}
