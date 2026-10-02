/** State-changing `StellarAgent` operations: every call that submits a transaction. */
import { xdr } from '@stellar/stellar-sdk';
import { StellarAgentError } from '../errors.js';
import type {
  OpenChannelParams,
  PayForAPIParams,
  RateLimitConfig,
  RequestWorkParams,
  TxResult,
} from '../types/index.js';
import {
  addressVal,
  bytesVal,
  enumVal,
  i128Val,
  i128BaseUnitsVal,
  paymentRouteVal,
  resolveAssetContract,
  spendPeriodVariant,
  u32Val,
  u64Val,
} from './encoding.js';
import { expectBigInt } from '../decode.js';
import type { InvokeFn } from './invocation.js';
import type { PaymentQuote } from '../routing/planner.js';

export interface RoutedPaymentExecution {
  quote: PaymentQuote;
}

/** Register a wallet in the configured AgentWalletFactory contract. */
export async function createAgentWallet(
  invoke: InvokeFn,
  agentWalletFactory: string,
  address: string,
  name: string,
): Promise<bigint> {
  const result = await invoke(agentWalletFactory, 'create_agent', [
    addressVal(address),
    addressVal(address),
    xdr.ScVal.scvString(name),
  ]);
  return expectBigInt(result.value, 'create_agent result');
}

/** Open a payment channel. Deposits tokens and sets a per-period spend limit. */
export async function openChannel(
  invoke: InvokeFn,
  paymentChannel: string,
  address: string,
  assetContracts: Record<string, string>,
  networkPassphrase: string,
  params: OpenChannelParams,
): Promise<bigint> {
  const result = await invoke(paymentChannel, 'open_channel', [
    addressVal(address),
    addressVal(address),
    addressVal(resolveAssetContract(params.token ?? 'XLM', assetContracts, networkPassphrase)),
    i128Val(params.deposit),
    i128Val(params.limitPerPeriod),
    enumVal(spendPeriodVariant(params.period)),
  ]);
  return expectBigInt(result.value, 'open_channel result');
}

/** Close a payment channel and return its remaining token balance. */
export async function closeChannel(
  invoke: InvokeFn,
  paymentChannel: string,
  address: string,
  channelId: bigint,
): Promise<TxResult> {
  return (await invoke(paymentChannel, 'close_channel', [
    addressVal(address),
    u64Val(channelId),
  ])).tx;
}

/**
 * Pay for an API call. Deducts from the given payment channel, respecting
 * on-chain spend limits automatically.
 *
 * A validated `routed` quote invokes the atomic multi-hop `pay_with_route`
 * entrypoint and returns its selected route/cost metadata. Without it,
 * `destAsset` retains the legacy single-AMM `pay_with_conversion` behavior.
 * Spend limits stay denominated in the channel's settlement asset either way.
 */
export async function payForAPI(
  invoke: InvokeFn,
  paymentChannel: string,
  address: string,
  assetContracts: Record<string, string>,
  networkPassphrase: string,
  channelId: bigint,
  params: PayForAPIParams,
  routed?: RoutedPaymentExecution,
): Promise<TxResult> {
  const destAsset = params.recipientAsset ?? params.destAsset;
  if (params.recipientAsset && params.destAsset && params.recipientAsset !== params.destAsset) {
    throw new StellarAgentError(
      'INVALID_ARGUMENT',
      'recipientAsset and destAsset must refer to the same asset',
    );
  }
  if (!routed && (destAsset !== undefined) !== (params.minReceived !== undefined)) {
    throw new StellarAgentError(
      'INVALID_ARGUMENT',
      'destAsset and minReceived must be set together',
    );
  }

  const common = [
    addressVal(address),
    u64Val(channelId),
    addressVal(params.recipient ?? address),
    i128Val(params.amount),
  ];
  if (routed) {
    if (!destAsset) {
      throw new StellarAgentError('INVALID_ARGUMENT', 'A routed payment requires recipientAsset');
    }
    const result = await invoke(paymentChannel, 'pay_with_route', [
      ...common,
      addressVal(resolveAssetContract(destAsset, assetContracts, networkPassphrase)),
      paymentRouteVal(routed.quote.route, assetContracts, networkPassphrase),
      i128BaseUnitsVal(routed.quote.minimumDestinationAmount),
      u32Val(routed.quote.validUntilLedger),
      bytesVal(params.endpoint),
    ]);
    return {
      ...result.tx,
      route: routed.quote.route,
      expectedDestinationAmount: routed.quote.route.expectedDestinationAmount,
      minimumDestinationAmount: routed.quote.minimumDestinationAmount,
    };
  }

  const args = destAsset === undefined
    ? [...common, bytesVal(params.endpoint)]
    : [
        ...common,
        addressVal(resolveAssetContract(destAsset, assetContracts, networkPassphrase)),
        i128Val(params.minReceived!),
        bytesVal(params.endpoint),
      ];
  return (await invoke(
    paymentChannel,
    destAsset === undefined ? 'pay' : 'pay_with_conversion',
    args,
  )).tx;
}

/** Create an escrow job delegating work to another agent. */
export async function requestWork(
  invoke: InvokeFn,
  getLatestLedger: () => Promise<number>,
  escrow: string,
  address: string,
  assetContracts: Record<string, string>,
  networkPassphrase: string,
  params: RequestWorkParams,
): Promise<bigint> {
  const latest = await getLatestLedger();
  const deadlineOffset = params.deadlineLedgers ?? 720;
  if (!Number.isInteger(deadlineOffset) || deadlineOffset <= 0) {
    throw new StellarAgentError(
      'INVALID_ARGUMENT',
      'deadlineLedgers must be a positive integer',
    );
  }
  const deadline = latest + deadlineOffset;
  if (deadline > 0xffff_ffff) {
    throw new StellarAgentError('INVALID_ARGUMENT', 'deadline ledger exceeds u32 range');
  }
  const result = await invoke(escrow, 'create_job', [
    addressVal(address),
    addressVal(resolveAssetContract(params.asset ?? 'XLM', assetContracts, networkPassphrase)),
    i128Val(params.escrowAmount),
    bytesVal(params.task),
    u32Val(deadline),
    params.arbiter ? addressVal(params.arbiter) : xdr.ScVal.scvVoid(),
  ]);
  return expectBigInt(result.value, 'create_job result');
}

/** Accept an open escrow job as a worker agent. */
export async function acceptJob(
  invoke: InvokeFn,
  escrow: string,
  address: string,
  jobId: bigint,
): Promise<TxResult> {
  return (await invoke(escrow, 'accept_job', [
    addressVal(address),
    u64Val(jobId),
  ])).tx;
}

/** Submit work result for an escrow job. */
export async function submitResult(
  invoke: InvokeFn,
  escrow: string,
  address: string,
  jobId: bigint,
  result: string,
): Promise<TxResult> {
  return (await invoke(escrow, 'submit_result', [
    addressVal(address),
    u64Val(jobId),
    bytesVal(result),
  ])).tx;
}

/** Release escrow payment to the worker after work is complete. */
export async function releasePayment(
  invoke: InvokeFn,
  escrow: string,
  address: string,
  jobId: bigint,
): Promise<TxResult> {
  return (await invoke(escrow, 'release', [
    addressVal(address),
    u64Val(jobId),
  ])).tx;
}

/** Configure rate limits for this agent on-chain. Protects against runaway spending. */
export async function setRateLimits(
  invoke: InvokeFn,
  rateLimiter: string,
  address: string,
  config: RateLimitConfig,
): Promise<TxResult> {
  return (await invoke(rateLimiter, 'set_limits', [
    addressVal(address),
    addressVal(address),
    i128Val(config.maxPerTx),
    i128Val(config.maxPerHour),
    i128Val(config.maxPerDay),
    u32Val(config.maxTxsPerHour),
  ])).tx;
}
