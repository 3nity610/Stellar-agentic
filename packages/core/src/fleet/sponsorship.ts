import {
  BASE_FEE,
  Operation,
  SorobanRpc,
  TransactionBuilder,
  type Account,
  type Transaction,
  type FeeBumpTransaction,
} from '@stellar/stellar-sdk';
import type { Signer } from '../signer.js';
import { KeypairSigner } from '../signer.js';
import type { TxResult } from '../types/index.js';
import type { ChannelAccount, ChannelAccountFactory } from './channelPool.js';
import { asFeeStrategy, type FeeStats, type FeeStrategy } from './feeStrategy.js';

/** Minimal RPC surface needed for classic sponsorship transactions. */
export interface SponsorRpc {
  getAccount(address: string): Promise<Account>;
  sendTransaction(transaction: Transaction | FeeBumpTransaction): Promise<{
    status: string;
    hash: string;
    errorResult?: { toXDR(format: 'base64'): string };
  }>;
  getTransaction(hash: string): Promise<{
    status: string;
    ledger?: number;
    resultXdr?: { feeCharged(): { toString(): string } };
  }>;
  getFeeStats?(): Promise<FeeStats>;
}

export interface SponsorServiceOptions {
  sponsorSigner: Signer;
  rpc: SponsorRpc;
  networkPassphrase: string;
  feeStrategy?: FeeStrategy | string | number | bigint;
  /** Transaction validity window. @default 60 */
  timeoutSeconds?: number;
  /** Confirmation polls before timing out. @default 30 */
  confirmationAttempts?: number;
  /** Delay between confirmation polls. @default 1000 */
  pollIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface SponsoredAccountOptions {
  /** Valid under sponsorship; the sponsor supplies the reserve. @default "0" */
  startingBalance?: string;
}

export interface SponsorshipRecord {
  account: string;
  sponsor: string;
  active: boolean;
  createdByService: boolean;
  transaction?: TxResult;
}

/** Sponsorship lifecycle failure with the rejected transaction hash when known. */
export class SponsorshipError extends Error {
  constructor(
    readonly code: 'SUBMISSION_FAILED' | 'TRANSACTION_FAILED' | 'TRANSACTION_TIMEOUT',
    message: string,
    readonly transactionHash?: string,
  ) {
    super(message);
    this.name = 'SponsorshipError';
  }
}

/**
 * Creates zero-balance accounts by sponsoring their account-entry reserve.
 * The creation envelope contains begin/create/end operations atomically and is
 * signed by both sponsor and target. The sponsor is also the transaction source,
 * so the new account never needs XLM for this lifecycle operation.
 */
export class SponsorService {
  readonly #sponsorSigner: Signer;
  readonly #rpc: SponsorRpc;
  readonly #networkPassphrase: string;
  readonly #feeStrategy: FeeStrategy;
  readonly #timeoutSeconds: number;
  readonly #confirmationAttempts: number;
  readonly #pollIntervalMs: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #records = new Map<string, SponsorshipRecord>();
  #sponsorAddress?: string;
  #lifecycleTail: Promise<void> = Promise.resolve();

  constructor(options: SponsorServiceOptions) {
    this.#sponsorSigner = options.sponsorSigner;
    this.#rpc = options.rpc;
    this.#networkPassphrase = options.networkPassphrase;
    this.#feeStrategy = asFeeStrategy(options.feeStrategy);
    this.#timeoutSeconds = options.timeoutSeconds ?? 60;
    this.#confirmationAttempts = options.confirmationAttempts ?? 30;
    this.#pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Signer used as the outer fee source for sponsored account transactions. */
  get feePayerSigner(): Signer {
    return this.#sponsorSigner;
  }

  async getSponsorAddress(): Promise<string> {
    this.#sponsorAddress ??= await this.#sponsorSigner.getPublicKey();
    return this.#sponsorAddress;
  }

  getRecord(account: string): SponsorshipRecord | undefined {
    const record = this.#records.get(account);
    return record ? { ...record } : undefined;
  }

  list(): SponsorshipRecord[] {
    return [...this.#records.values()].map((record) => ({ ...record }));
  }

  /** Return an existing account unchanged, or atomically create it sponsored. */
  async ensureSponsoredAccount(
    accountSigner: Signer,
    options: SponsoredAccountOptions = {},
  ): Promise<SponsorshipRecord> {
    return this.#serialized(async () => {
      const account = await accountSigner.getPublicKey();
      const managed = this.#records.get(account);
      if (managed?.active) return { ...managed };
      try {
        await this.#rpc.getAccount(account);
        const existing: SponsorshipRecord = {
          account,
          sponsor: await this.getSponsorAddress(),
          // Existing accounts cannot have their account-entry reserve newly
          // sponsored by begin/end-future-reserves. They may already be funded.
          active: false,
          createdByService: false,
        };
        this.#records.set(account, existing);
        return { ...existing };
      } catch (error) {
        if (!isMissingAccount(error)) throw error;
      }
      return this.#createSponsoredAccount(accountSigner, options);
    });
  }

  /** Atomically sponsor the reserve and create a target account. */
  async createSponsoredAccount(
    accountSigner: Signer,
    options: SponsoredAccountOptions = {},
  ): Promise<SponsorshipRecord> {
    return this.#serialized(() => this.#createSponsoredAccount(accountSigner, options));
  }

  async #createSponsoredAccount(
    accountSigner: Signer,
    options: SponsoredAccountOptions,
  ): Promise<SponsorshipRecord> {
    const [sponsor, target] = await Promise.all([
      this.getSponsorAddress(),
      accountSigner.getPublicKey(),
    ]);
    const source = await this.#rpc.getAccount(sponsor);
    const fee = await this.#fee(3);
    const transaction = new TransactionBuilder(source, {
      fee,
      networkPassphrase: this.#networkPassphrase,
    })
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: target }))
      .addOperation(Operation.createAccount({
        destination: target,
        startingBalance: options.startingBalance ?? '0',
      }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: target }))
      .setTimeout(this.#timeoutSeconds)
      .build();

    const result = await this.#signSubmitAndConfirm(transaction, [
      this.#sponsorSigner,
      accountSigner,
    ]);
    const record: SponsorshipRecord = {
      account: target,
      sponsor,
      active: true,
      createdByService: true,
      transaction: result,
    };
    this.#records.set(target, record);
    return { ...record };
  }

  /**
   * Revoke sponsorship of the account entry. The target must hold enough XLM
   * for its own reserve before the network will accept this operation.
   */
  async revokeAccountSponsorship(account: string): Promise<TxResult> {
    return this.#serialized(async () => {
      const sponsor = await this.getSponsorAddress();
      const source = await this.#rpc.getAccount(sponsor);
      const transaction = new TransactionBuilder(source, {
        fee: await this.#fee(1),
        networkPassphrase: this.#networkPassphrase,
      })
        .addOperation(Operation.revokeAccountSponsorship({ account }))
        .setTimeout(this.#timeoutSeconds)
        .build();
      const result = await this.#signSubmitAndConfirm(transaction, [this.#sponsorSigner]);
      const record = this.#records.get(account);
      if (record) {
        record.active = false;
        record.transaction = result;
      }
      return result;
    });
  }

  /**
   * Reclaim a disposable sponsored account by merging it into the sponsor.
   * The target authorizes the merge while the sponsor pays the transaction fee.
   */
  async closeSponsoredAccount(accountSigner: Signer, destination?: string): Promise<TxResult> {
    return this.#serialized(async () => {
      const [sponsor, account] = await Promise.all([
        this.getSponsorAddress(),
        accountSigner.getPublicKey(),
      ]);
      const source = await this.#rpc.getAccount(sponsor);
      const transaction = new TransactionBuilder(source, {
        fee: await this.#fee(1),
        networkPassphrase: this.#networkPassphrase,
      })
        .addOperation(Operation.accountMerge({ destination: destination ?? sponsor, source: account }))
        .setTimeout(this.#timeoutSeconds)
        .build();
      const result = await this.#signSubmitAndConfirm(transaction, [
        this.#sponsorSigner,
        accountSigner,
      ]);
      const record = this.#records.get(account);
      if (record) {
        record.active = false;
        record.transaction = result;
      }
      return result;
    });
  }

  async #fee(operationCount: number): Promise<string> {
    return this.#feeStrategy.getFee({
      phase: 'sponsorship',
      operationCount,
      minimumFee: BASE_FEE,
      soroban: false,
      getFeeStats: this.#rpc.getFeeStats
        ? () => this.#rpc.getFeeStats!()
        : undefined,
    });
  }

  async #signSubmitAndConfirm(transaction: Transaction, signers: Signer[]): Promise<TxResult> {
    let signedXdr = transaction.toXDR();
    for (const signer of signers) {
      signedXdr = await signer.signTransaction(signedXdr, {
        networkPassphrase: this.#networkPassphrase,
      });
    }
    const signed = TransactionBuilder.fromXDR(signedXdr, this.#networkPassphrase);
    const localHash = signed.hash().toString('hex');
    let submitted: { hash: string } | undefined;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await this.#rpc.sendTransaction(signed);
        if (result.status === 'PENDING' || result.status === 'DUPLICATE') {
          submitted = result;
          break;
        }
        if (result.status !== 'TRY_AGAIN_LATER') {
          throw new SponsorshipError(
            'SUBMISSION_FAILED',
            `Sponsorship transaction submission failed (${result.status})${
              result.errorResult ? `: ${result.errorResult.toXDR('base64')}` : ''
            }`,
            result.hash,
          );
        }
      } catch (error) {
        if (error instanceof SponsorshipError) throw error;
        try {
          const known = await this.#rpc.getTransaction(localHash);
          if (known.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
            submitted = { hash: localHash };
            break;
          }
        } catch {
          // Retry the identical envelope below.
        }
        if (attempt === 3) throw error;
      }
      if (attempt < 3) await this.#sleep(100 * 2 ** (attempt - 1));
    }
    if (!submitted) {
      throw new SponsorshipError(
        'SUBMISSION_FAILED',
        'Sponsorship transaction submission exhausted retries',
        localHash,
      );
    }
    for (let attempt = 0; attempt < this.#confirmationAttempts; attempt += 1) {
      const confirmed = await this.#rpc.getTransaction(submitted.hash);
      if (confirmed.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        return {
          hash: submitted.hash,
          success: true,
          ledger: confirmed.ledger,
          feePaid: confirmed.resultXdr?.feeCharged().toString() ?? transaction.fee,
          feeBumped: false,
          sourceAccount: transaction.source,
        };
      }
      if (confirmed.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new SponsorshipError(
          'TRANSACTION_FAILED',
          'Sponsorship lifecycle transaction failed',
          submitted.hash,
        );
      }
      await this.#sleep(this.#pollIntervalMs);
    }
    throw new SponsorshipError(
      'TRANSACTION_TIMEOUT',
      'Sponsorship lifecycle transaction did not complete in time',
      submitted.hash,
    );
  }

  #serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = this.#lifecycleTail.then(work, work);
    this.#lifecycleTail = run.then(() => undefined, () => undefined);
    return run;
  }
}

/** Pool lifecycle backed by zero-balance sponsored accounts. */
export class SponsoredChannelAccountFactory implements ChannelAccountFactory {
  constructor(readonly sponsor: SponsorService) {}

  async create(): Promise<ChannelAccount> {
    const signer = KeypairSigner.random();
    const record = await this.sponsor.createSponsoredAccount(signer);
    return {
      address: record.account,
      signer,
      metadata: { sponsoredBy: record.sponsor },
    };
  }

  async reclaim(account: ChannelAccount): Promise<void> {
    await this.sponsor.closeSponsoredAccount(account.signer);
  }
}

function isMissingAccount(error: unknown): boolean {
  const candidate = error as { response?: { status?: unknown }; status?: unknown; code?: unknown; message?: unknown } | null;
  const status = candidate?.response?.status ?? candidate?.status ?? candidate?.code;
  return status === 404 || /not.?found|does not exist|missing account/i.test(String(candidate?.message ?? ''));
}
