import {
  Account,
  Address,
  Asset,
  Contract,
  Keypair,
  nativeToScVal,
  scValToNative,
  Operation,
  SorobanRpc,
  StrKey,
  TransactionBuilder,
  BASE_FEE,
  xdr,
} from '@stellar/stellar-sdk';

import type { Signer } from './signer.js';
import type {
  UnsignedTxBuild,
  OpenChannelParams,
  RateLimitConfig,
  TopUpParams,
} from './types/index.js';
import { StellarAgentError } from './errors.js';
import type { StellarAgentErrorCode } from './errors.js';
import { toStroops } from './math/index.js';

export function transactionSignatureCount(
  envelope: xdr.TransactionEnvelope,
): number {
  const tx = envelope.v1();
  return tx.signatures().length;
}

export function getSignaturesCollected(envelopeXdr: string): number {
  const parsed = xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');
  return transactionSignatureCount(parsed);
}

export function enoughSignatures(
  envelopeXdr: string,
  threshold: number,
): boolean {
  return getSignaturesCollected(envelopeXdr) >= threshold;
}

export function addSignatureToEnvelope(
  envelopeXdr: string,
  keypair: Keypair,
  networkPassphrase: string,
): string {
  const tx = TransactionBuilder.fromXDR(envelopeXdr, networkPassphrase);
  tx.sign(keypair);
  return tx.toXDR();
}

export function mergeSignatures(
  baseXdr: string,
  newXdr: string,
  networkPassphrase: string,
): string {
  const baseTx = TransactionBuilder.fromXDR(baseXdr, networkPassphrase);
  const newTx = TransactionBuilder.fromXDR(newXdr, networkPassphrase);
  const newEnv = newTx.toEnvelope().v1();
  const newSigs = newEnv.signatures();
  for (const sig of newSigs) {
    baseTx.addSignature(sig);
  }
  return baseTx.toXDR();
}

export function buildSetOptionsOp(
  source: string,
  signerKey: string,
  signerWeight: number,
): xdr.Operation {
  if (!StrKey.isValidEd25519PublicKey(signerKey)) {
    throw new StellarAgentError(
      'INVALID_ARGUMENT',
      `Invalid signer key: ${signerKey}. Must be a G... address.`,
    );
  }
  return Operation.setOptions({
    source,
    signer: { ed25519PublicKey: signerKey, weight: signerWeight },
  });
}

export function buildSetThresholdsOp(
  source: string,
  config: { masterWeight: number; lowThreshold: number; medThreshold: number; highThreshold: number },
): xdr.Operation {
  return Operation.setOptions({
    source,
    masterWeight: config.masterWeight,
    lowThreshold: config.lowThreshold,
    medThreshold: config.medThreshold,
    highThreshold: config.highThreshold,
  });
}

export class UnsignedTxBuilder {
  private rpc: SorobanRpc.Server;
  private networkPassphrase: string;
  private signer: Signer;
  private threshold: number;

  constructor(
    rpc: SorobanRpc.Server,
    networkPassphrase: string,
    signer: Signer,
    threshold: number,
  ) {
    this.rpc = rpc;
    this.networkPassphrase = networkPassphrase;
    this.signer = signer;
    this.threshold = threshold;
  }

  async buildOpenChannel(
    publicKey: string,
    contracts: { paymentChannel: string },
    assetContracts: Record<string, string>,
    params: OpenChannelParams,
  ): Promise<UnsignedTxBuild> {
    const resolvedAsset = this.resolveAssetContract(
      params.token ?? 'XLM',
      assetContracts,
    );
    const args = [
      this.addressVal(publicKey),
      this.addressVal(publicKey),
      this.addressVal(resolvedAsset),
      this.i128(params.deposit),
      this.i128(params.limitPerPeriod),
      this.spendPeriodEnum(params.period),
    ];
    return this.build(contracts.paymentChannel, 'open_channel', args, publicKey);
  }

  async buildCloseChannel(
    publicKey: string,
    contracts: { paymentChannel: string },
    channelId: bigint,
  ): Promise<UnsignedTxBuild> {
    const args = [
      this.addressVal(publicKey),
      this.u64(channelId),
    ];
    return this.build(contracts.paymentChannel, 'close_channel', args, publicKey);
  }

  async buildSetRateLimits(
    publicKey: string,
    contracts: { rateLimiter: string },
    config: RateLimitConfig,
  ): Promise<UnsignedTxBuild> {
    const args = [
      this.addressVal(publicKey),
      this.addressVal(publicKey),
      this.i128(config.maxPerTx),
      this.i128(config.maxPerHour),
      this.i128(config.maxPerDay),
      this.u32(config.maxTxsPerHour),
    ];
    return this.build(contracts.rateLimiter, 'set_limits', args, publicKey);
  }

  async buildTopUp(
    publicKey: string,
    contracts: { paymentChannel: string },
    assetContracts: Record<string, string>,
    params: TopUpParams,
  ): Promise<UnsignedTxBuild> {
    const resolvedAsset = this.resolveAssetContract(
      params.token ?? 'XLM',
      assetContracts,
    );
    const channelId = params.channelId;
    if (channelId === undefined) {
      throw new StellarAgentError(
        'INVALID_ARGUMENT',
        'channelId is required for top_up',
      );
    }
    const args = [
      this.addressVal(publicKey),
      this.addressVal(publicKey),
      this.u64(channelId),
      this.addressVal(resolvedAsset),
      this.i128(params.amount),
    ];
    return this.build(contracts.paymentChannel, 'top_up', args, publicKey);
  }

  private async build(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    publicKey: string,
  ): Promise<UnsignedTxBuild> {
    try {
      const account = await this.rpc.getAccount(publicKey);
      const operation = new Contract(contractId).call(method, ...args);
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      const simulation = await this.rpc.simulateTransaction(transaction);
      if (SorobanRpc.Api.isSimulationError(simulation)) {
        throw new StellarAgentError(
          'SIMULATION_FAILED',
          `${method} simulation failed: ${simulation.error}`,
        );
      }
      if (SorobanRpc.Api.isSimulationRestore(simulation)) {
        throw new StellarAgentError(
          'SIMULATION_FAILED',
          `${method} requires restoring expired ledger entries before invocation`,
        );
      }

      const validUntilLedgerSeq = simulation.latestLedger + 100;

      const signedAuthEntries = await Promise.all(
        (simulation.result?.auth ?? []).map(async (entry: xdr.SorobanAuthorizationEntry) => {
          if (entry.credentials().switch().name !== 'sorobanCredentialsAddress') {
            return entry;
          }
          const signedXdr = await this.signer.signAuthEntry(entry.toXDR('base64'), {
            networkPassphrase: this.networkPassphrase,
            validUntilLedgerSeq,
          });
          return xdr.SorobanAuthorizationEntry.fromXDR(signedXdr, 'base64');
        }),
      );

      const hostFunction = operation.body().invokeHostFunctionOp().hostFunction();
      const authorizedOperation = Operation.invokeHostFunction({
        func: hostFunction,
        auth: signedAuthEntries,
      });
      const authorizedTransaction = TransactionBuilder.cloneFrom(transaction)
        .clearOperations()
        .addOperation(authorizedOperation)
        .build();
      const assembled = SorobanRpc.assembleTransaction(
        authorizedTransaction,
        simulation,
      ).build();

      const unsignedEnvelope = assembled.toEnvelope().toXDR('base64');

      return {
        transactionXdr: unsignedEnvelope,
        authEntryXdrs: signedAuthEntries.map((e: xdr.SorobanAuthorizationEntry) => e.toXDR('base64')),
        validUntilLedgerSeq,
        threshold: this.threshold,
        signaturesCollected: 0,
      };
    } catch (error) {
      if (error instanceof StellarAgentError) throw error;
      throw new StellarAgentError(
        'NETWORK_ERROR',
        `${method} failed while communicating with Soroban RPC: ${this.errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  signUnsignedTx(
    buildResult: UnsignedTxBuild,
    keypair: Keypair,
  ): UnsignedTxBuild {
    const signedXdr = addSignatureToEnvelope(
      buildResult.transactionXdr,
      keypair,
      this.networkPassphrase,
    );
    const collected = getSignaturesCollected(signedXdr);
    return {
      ...buildResult,
      transactionXdr: signedXdr,
      signaturesCollected: collected,
    };
  }

  async submitSigned(
    buildResult: UnsignedTxBuild,
  ): Promise<{ hash: string; success: boolean; ledger?: number }> {
    if (!enoughSignatures(buildResult.transactionXdr, buildResult.threshold)) {
      throw new StellarAgentError(
        'NOT_AUTHORIZED',
        `Not enough signatures: have ${buildResult.signaturesCollected}, need ${buildResult.threshold}`,
      );
    }

    const tx = TransactionBuilder.fromXDR(
      buildResult.transactionXdr,
      this.networkPassphrase,
    );

    try {
      const submitted = await this.rpc.sendTransaction(tx);
      if (submitted.status !== 'PENDING' && submitted.status !== 'DUPLICATE') {
        throw new StellarAgentError(
          'SUBMISSION_FAILED',
          `Transaction submission failed (${submitted.status}): ${
            submitted.errorResult?.toXDR('base64') || 'unknown error'
          }`,
        );
      }

      for (let attempt = 0; attempt < 30; attempt++) {
        const confirmed = await this.rpc.getTransaction(submitted.hash);
        if (confirmed.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
          return {
            hash: submitted.hash,
            success: true,
            ledger: confirmed.ledger,
          };
        }
        if (confirmed.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
          const diagText = this.diagnosticText(confirmed.diagnosticEventsXdr);
          throw this.contractError(
            'TRANSACTION_FAILED',
            `Transaction failed${diagText ? `: ${diagText}` : ''}`,
            submitted.hash,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new StellarAgentError(
        'TRANSACTION_TIMEOUT',
        'Transaction did not complete in time',
        { transactionHash: submitted.hash },
      );
    } catch (error) {
      if (error instanceof StellarAgentError) throw error;
      throw new StellarAgentError(
        'NETWORK_ERROR',
        `Transaction failed while communicating with Soroban RPC: ${this.errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  private resolveAssetContract(
    asset: string,
    assetContracts: Record<string, string>,
  ): string {
    if (asset === 'XLM') return Asset.native().contractId(this.networkPassphrase);
    const resolved = assetContracts[asset] ?? asset;
    try {
      Address.fromString(resolved);
      if (!resolved.startsWith('C')) throw new Error('not a contract');
      return resolved;
    } catch {
      throw new StellarAgentError(
        'INVALID_ARGUMENT',
        `Unknown asset "${asset}". Pass its C... token contract ID or configure assetContracts.${asset}.`,
      );
    }
  }

  private addressVal(value: string): xdr.ScVal {
    try {
      return Address.fromString(value).toScVal();
    } catch (error) {
      throw new StellarAgentError('INVALID_ARGUMENT', `Invalid Stellar address: ${value}`, {
        cause: error,
      });
    }
  }

  private i128(value: string): xdr.ScVal {
    try {
      return nativeToScVal(toStroops(value), { type: 'i128' });
    } catch (error) {
      throw new StellarAgentError('INVALID_ARGUMENT', `Invalid amount: ${value}`, { cause: error });
    }
  }

  private u64(value: bigint): xdr.ScVal {
    if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
      throw new StellarAgentError('INVALID_ARGUMENT', `Value is outside u64 range: ${value}`);
    }
    return nativeToScVal(value, { type: 'u64' });
  }

  private u32(value: number): xdr.ScVal {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
      throw new StellarAgentError('INVALID_ARGUMENT', `Value is outside u32 range: ${value}`);
    }
    return nativeToScVal(value, { type: 'u32' });
  }

  private spendPeriodEnum(period: OpenChannelParams['period']): xdr.ScVal {
    const variant = { per_ledger: 'PerLedger', hourly: 'Hourly', daily: 'Daily' }[period];
    return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant)]);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private diagnosticText(events: xdr.DiagnosticEvent[] | undefined): string {
    if (!events?.length) return '';
    try {
      return events.map((diagnostic: xdr.DiagnosticEvent) => {
        const event = diagnostic.event();
        return JSON.stringify({
          topics: event.body().v0().topics().map((topic: xdr.ScVal) => scValToNative(topic)),
          data: scValToNative(event.body().v0().data()),
        }, (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
      }).join('; ');
    } catch {
      return events.map((event: xdr.DiagnosticEvent) => event.toXDR('base64')).join('; ');
    }
  }

  private contractError(
    fallback: StellarAgentErrorCode,
    message: string,
    transactionHash?: string,
  ): StellarAgentError {
    const mappings: Array<[RegExp, StellarAgentErrorCode]> = [
      [/spend limit exceeded/i, 'SPEND_LIMIT_EXCEEDED'],
      [/channel not found/i, 'CHANNEL_NOT_FOUND'],
      [/channel is closed/i, 'CHANNEL_CLOSED'],
      [/not authorized/i, 'NOT_AUTHORIZED'],
    ];
    const code = mappings.find(([pattern]) => pattern.test(message))?.[1] ?? fallback;
    return new StellarAgentError(code, message, { transactionHash });
  }
}
