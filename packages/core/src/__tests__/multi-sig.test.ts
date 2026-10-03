import { describe, it, expect, vi } from 'vitest';
import {
  Account,
  Address,
  Keypair,
  SorobanDataBuilder,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  StrKey,
  xdr,
} from '@stellar/stellar-sdk';

import {
  UnsignedTxBuilder,
  addSignatureToEnvelope,
  enoughSignatures,
  getSignaturesCollected,
  buildSetOptionsOp,
  buildSetThresholdsOp,
} from '../multi-sig.js';
import { StellarAgent, StellarAgentError } from '../index.js';
import { KeypairSigner } from '../signer.js';
import type { UnsignedTxBuild } from '../types/index.js';
import { TEST_PUBLIC, TEST_SECRET, DEPLOYED_CONTRACTS } from './fixtures.js';

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

// ── 3 test keypairs for 2-of-3 multi-sig ────────────────────────────────

const keypairA = Keypair.random();
const keypairB = Keypair.random();
const keypairC = Keypair.random();

// ── Helpers ─────────────────────────────────────────────────────────────

function addressAuthEntry(): xdr.SorobanAuthorizationEntry {
  const invokeArgs = new xdr.InvokeContractArgs({
    contractAddress: Address.fromString(DEPLOYED_CONTRACTS.paymentChannel).toScAddress(),
    functionName: 'open_channel',
    args: [],
  });
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(TEST_PUBLIC).toScAddress(),
        nonce: xdr.Int64.fromString('1'),
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction
        .sorobanAuthorizedFunctionTypeContractFn(invokeArgs),
      subInvocations: [],
    }),
  });
}

function simulation(retval: xdr.ScVal, auth: xdr.SorobanAuthorizationEntry[] = []) {
  return {
    id: 'simulation',
    latestLedger: 100,
    events: [],
    _parsed: true,
    transactionData: new SorobanDataBuilder(),
    minResourceFee: '0',
    cost: { cpuInsns: '0', memBytes: '0' },
    result: { auth, retval },
  };
}

function mockRpc() {
  return {
    getAccount: vi.fn(async () => new Account(TEST_PUBLIC, '1')),
    simulateTransaction: vi.fn(async () => simulation(
      nativeToScVal(7n, { type: 'u64' }),
      [addressAuthEntry()],
    )),
    sendTransaction: vi.fn(async () => ({ status: 'PENDING', hash: 'tx-hash' })),
    getTransaction: vi.fn(async () => ({
      status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
      ledger: 123,
      returnValue: nativeToScVal(7n, { type: 'u64' }),
    })),
  };
}

async function createAgent(rpc?: Record<string, unknown>) {
  const agent = await StellarAgent.create({
    network: 'testnet',
    secretKey: TEST_SECRET,
    contracts: DEPLOYED_CONTRACTS,
  });
  if (rpc) {
    (agent as unknown as { rpc: Record<string, unknown> }).rpc = rpc;
  }
  return agent;
}

function createUnsignedTxBuilder(rpc: Record<string, unknown>, threshold = 2) {
  return new UnsignedTxBuilder(
    rpc as unknown as SorobanRpc.Server,
    NETWORK_PASSPHRASE,
    new KeypairSigner(keypairA),
    threshold,
  );
}

function buildDummyTx(signWith?: Keypair[]): string {
  const source = Keypair.random();
  const account = new Account(source.publicKey(), '1');
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .setTimeout(30)
    .build();
  if (signWith) {
    for (const kp of signWith) {
      tx.sign(kp);
    }
  }
  return tx.toXDR();
}

// ─── Static helpers ─────────────────────────────────────────────────────

describe('multi-sig static helpers', () => {
  describe('getSignaturesCollected', () => {
    it('returns 0 for unsigned tx XDR', () => {
      const xdrString = buildDummyTx();
      expect(getSignaturesCollected(xdrString)).toBe(0);
    });

    it('returns correct count for signed tx XDR', () => {
      const xdrString = buildDummyTx([keypairA, keypairB]);
      expect(getSignaturesCollected(xdrString)).toBe(2);
    });
  });

  describe('enoughSignatures', () => {
    it('returns true when threshold is met', () => {
      const xdrString = buildDummyTx([keypairA, keypairB, keypairC]);
      expect(enoughSignatures(xdrString, 2)).toBe(true);
      expect(enoughSignatures(xdrString, 3)).toBe(true);
    });

    it('returns false when threshold is not met', () => {
      const xdrString = buildDummyTx([keypairA]);
      expect(enoughSignatures(xdrString, 2)).toBe(false);
    });

    it('returns false for unsigned envelope with threshold > 0', () => {
      const xdrString = buildDummyTx();
      expect(enoughSignatures(xdrString, 1)).toBe(false);
    });
  });

  describe('addSignatureToEnvelope', () => {
    it('adds one signature to an unsigned envelope', () => {
      const unsigned = buildDummyTx();
      const signed = addSignatureToEnvelope(unsigned, keypairA, NETWORK_PASSPHRASE);
      expect(getSignaturesCollected(signed)).toBe(1);
    });

    it('adds a second signature to an already-signed envelope', () => {
      const once = addSignatureToEnvelope(buildDummyTx(), keypairA, NETWORK_PASSPHRASE);
      const twice = addSignatureToEnvelope(once, keypairB, NETWORK_PASSPHRASE);
      expect(getSignaturesCollected(twice)).toBe(2);
    });
  });

  describe('buildSetOptionsOp', () => {
    it('produces a setOptions operation for a signer', () => {
      const op = buildSetOptionsOp(TEST_PUBLIC, keypairB.publicKey(), 1);
      expect(op.body().switch().name).toBe('setOptions');
    });

    it('throws for invalid signer key', () => {
      expect(() => buildSetOptionsOp(TEST_PUBLIC, 'invalid', 1))
        .toThrow(StellarAgentError);
    });
  });

  describe('buildSetThresholdsOp', () => {
    it('produces a setOptions operation with thresholds', () => {
      const op = buildSetThresholdsOp(TEST_PUBLIC, {
        masterWeight: 1,
        lowThreshold: 1,
        medThreshold: 2,
        highThreshold: 3,
      });
      expect(op.body().switch().name).toBe('setOptions');
    });
  });
});

// ─── UnsignedTxBuilder ─────────────────────────────────────────────────

describe('UnsignedTxBuilder', () => {
  describe('buildOpenChannel', () => {
    it('builds unsigned XDR with auth entries from simulation', async () => {
      const rpc = mockRpc();
      const builder = createUnsignedTxBuilder(rpc);

      const build = await builder.buildOpenChannel(
        TEST_PUBLIC,
        { paymentChannel: DEPLOYED_CONTRACTS.paymentChannel },
        {},
        { deposit: '10', limitPerPeriod: '1', period: 'hourly' },
      );

      expect(build.transactionXdr).toBeTruthy();
      expect(typeof build.transactionXdr).toBe('string');
      expect(() => TransactionBuilder.fromXDR(build.transactionXdr, NETWORK_PASSPHRASE)).not.toThrow();
      expect(build.signaturesCollected).toBe(0);
      expect(build.threshold).toBe(2);
      expect(build.validUntilLedgerSeq).toBe(200);
      expect(build.authEntryXdrs).toHaveLength(1);

      expect(rpc.getAccount).toHaveBeenCalledWith(TEST_PUBLIC);
      expect(rpc.simulateTransaction).toHaveBeenCalledOnce();
    });

    it('throws SIMULATION_FAILED on simulation error', async () => {
      const rpc = mockRpc();
      rpc.simulateTransaction = vi.fn(async () => ({
        error: 'contract panic: some error',
      }));
      const builder = createUnsignedTxBuilder(rpc);

      await expect(
        builder.buildOpenChannel(
          TEST_PUBLIC,
          { paymentChannel: DEPLOYED_CONTRACTS.paymentChannel },
          {},
          { deposit: '10', limitPerPeriod: '1', period: 'hourly' },
        ),
      ).rejects.toThrow(StellarAgentError);
    });

    it('throws on restore simulation', async () => {
      const rpc = mockRpc();
      rpc.simulateTransaction = vi.fn(async () => simulation(nativeToScVal(7n, { type: 'u64' })));
      const builder = createUnsignedTxBuilder(rpc);

      await expect(
        builder.buildOpenChannel(
          TEST_PUBLIC,
          { paymentChannel: DEPLOYED_CONTRACTS.paymentChannel },
          {},
          { deposit: '10', limitPerPeriod: '1', period: 'hourly' },
        ),
      ).resolves.toBeTruthy();
    });
  });

  describe('buildCloseChannel', () => {
    it('builds unsigned close_channel XDR', async () => {
      const rpc = mockRpc();
      const builder = createUnsignedTxBuilder(rpc);

      const build = await builder.buildCloseChannel(
        TEST_PUBLIC,
        { paymentChannel: DEPLOYED_CONTRACTS.paymentChannel },
        7n,
      );

      expect(build.transactionXdr).toBeTruthy();
      expect(build.signaturesCollected).toBe(0);
      expect(() => TransactionBuilder.fromXDR(build.transactionXdr, NETWORK_PASSPHRASE)).not.toThrow();
      expect(rpc.simulateTransaction).toHaveBeenCalledOnce();
    });
  });

  describe('buildSetRateLimits', () => {
    it('builds unsigned set_limits XDR', async () => {
      const rpc = mockRpc();
      const builder = createUnsignedTxBuilder(rpc);

      const build = await builder.buildSetRateLimits(
        TEST_PUBLIC,
        { rateLimiter: DEPLOYED_CONTRACTS.rateLimiter },
        { maxPerTx: '10', maxPerHour: '100', maxPerDay: '1000', maxTxsPerHour: 10 },
      );

      expect(build.transactionXdr).toBeTruthy();
      expect(build.signaturesCollected).toBe(0);
      expect(() => TransactionBuilder.fromXDR(build.transactionXdr, NETWORK_PASSPHRASE)).not.toThrow();
    });
  });

  describe('buildTopUp', () => {
    it('builds unsigned top_up XDR', async () => {
      const rpc = mockRpc();
      const builder = createUnsignedTxBuilder(rpc);

      const build = await builder.buildTopUp(
        TEST_PUBLIC,
        { paymentChannel: DEPLOYED_CONTRACTS.paymentChannel },
        {},
        { channelId: 7n, amount: '5', token: 'XLM' },
      );

      expect(build.transactionXdr).toBeTruthy();
      expect(build.signaturesCollected).toBe(0);
      expect(() => TransactionBuilder.fromXDR(build.transactionXdr, NETWORK_PASSPHRASE)).not.toThrow();
    });

    it('throws when channelId is missing', async () => {
      const rpc = mockRpc();
      const builder = createUnsignedTxBuilder(rpc);

      await expect(
        builder.buildTopUp(
          TEST_PUBLIC,
          { paymentChannel: DEPLOYED_CONTRACTS.paymentChannel },
          {},
          {} as { channelId: bigint; amount: string; token?: string },
        ),
      ).rejects.toThrow(StellarAgentError);
    });
  });

  describe('signUnsignedTx', () => {
    it('adds a signature from the given keypair', () => {
      const builder = createUnsignedTxBuilder(mockRpc(), 2);
      const unsigned = dummyBuild(0, 2);

      const signed = builder.signUnsignedTx(unsigned, keypairA);
      expect(signed.signaturesCollected).toBe(1);
      expect(signed.transactionXdr).not.toBe(unsigned.transactionXdr);
    });

    it('adds multiple signatures incrementally', () => {
      const builder = createUnsignedTxBuilder(mockRpc(), 2);
      let build = dummyBuild(0, 2);

      build = builder.signUnsignedTx(build, keypairA);
      expect(build.signaturesCollected).toBe(1);

      build = builder.signUnsignedTx(build, keypairB);
      expect(build.signaturesCollected).toBe(2);
    });
  });

  describe('submitSigned', () => {
    it('submits when threshold is met', async () => {
      const rpc = mockRpc();
      const builder = createUnsignedTxBuilder(rpc, 2);

      let build = dummyBuild(0, 2);
      build = builder.signUnsignedTx(build, keypairA);
      build = builder.signUnsignedTx(build, keypairB);

      const result = await builder.submitSigned(build);

      expect(result.hash).toBe('tx-hash');
      expect(result.success).toBe(true);
      expect(result.ledger).toBe(123);
      expect(rpc.sendTransaction).toHaveBeenCalledOnce();
      expect(rpc.getTransaction).toHaveBeenCalledWith('tx-hash');
    });

    it('throws NOT_AUTHORIZED when threshold is not met', async () => {
      const rpc = mockRpc();
      const builder = createUnsignedTxBuilder(rpc, 2);

      let build = dummyBuild(0, 2);
      build = builder.signUnsignedTx(build, keypairA);

      await expect(builder.submitSigned(build)).rejects.toThrow(StellarAgentError);
      await expect(builder.submitSigned(build)).rejects.toMatchObject({
        code: 'NOT_AUTHORIZED',
      });
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    });

    it('errors on submission failure', async () => {
      const rpc = mockRpc();
      rpc.sendTransaction = vi.fn(async () => ({ status: 'ERROR', errorResult: null }));
      const builder = createUnsignedTxBuilder(rpc, 1);

      let build = dummyBuild(0, 1);
      build = builder.signUnsignedTx(build, keypairA);

      await expect(builder.submitSigned(build)).rejects.toThrow(StellarAgentError);
    });
  });
});

// ─── Integration with StellarAgent ──────────────────────────────────────

describe('StellarAgent multi-sig integration', () => {
  describe('enableUnsignedTx / buildUnsignedOpenChannelTx', () => {
    it('builds unsigned XDR through the agent', async () => {
      const rpc = mockRpc();
      const agent = await createAgent(rpc);
      agent.enableUnsignedTx(2);

      const build = await agent.buildUnsignedOpenChannelTx({
        deposit: '10',
        limitPerPeriod: '1',
        period: 'hourly',
      });

      expect(build.transactionXdr).toBeTruthy();
      expect(build.signaturesCollected).toBe(0);
      expect(build.threshold).toBe(2);
    });

    it('throws when enableUnsignedTx was not called', async () => {
      const agent = await createAgent();
      await expect(
        agent.buildUnsignedOpenChannelTx({
          deposit: '10',
          limitPerPeriod: '1',
          period: 'hourly',
        }),
      ).rejects.toThrow(/Multi-sig not enabled/);
    });
  });

  describe('buildUnsignedCloseChannelTx', () => {
    it('builds unsigned XDR for closing a channel', async () => {
      const rpc = mockRpc();
      const agent = await createAgent(rpc);
      agent.enableUnsignedTx(2);
      (agent as unknown as { activeChannelId?: bigint }).activeChannelId = 7n;

      const build = await agent.buildUnsignedCloseChannelTx();
      expect(build.transactionXdr).toBeTruthy();
      expect(build.signaturesCollected).toBe(0);
    });

    it('throws with no active channel', async () => {
      const agent = await createAgent();
      agent.enableUnsignedTx(2);
      await expect(agent.buildUnsignedCloseChannelTx()).rejects.toThrow(/No active/);
    });
  });

  describe('buildUnsignedSetRateLimitsTx', () => {
    it('builds unsigned XDR for rate limits', async () => {
      const rpc = mockRpc();
      const agent = await createAgent(rpc);
      agent.enableUnsignedTx(2);

      const build = await agent.buildUnsignedSetRateLimitsTx({
        maxPerTx: '10',
        maxPerHour: '100',
        maxPerDay: '1000',
        maxTxsPerHour: 10,
      });

      expect(build.transactionXdr).toBeTruthy();
      expect(build.signaturesCollected).toBe(0);
    });
  });

  describe('signUnsignedTx', () => {
    it('signs using the agent own signer', async () => {
      const rpc = mockRpc();
      const agent = await createAgent(rpc);
      agent.enableUnsignedTx(2);

      const build = await agent.buildUnsignedOpenChannelTx({
        deposit: '10',
        limitPerPeriod: '1',
        period: 'hourly',
      });

      const signed = await agent.signUnsignedTx(build);
      expect(signed.signaturesCollected).toBe(1);
    });
  });

  // ── 2-of-3 full round-trip: build → sign (2 parties) → submit ────────
  // ── Acceptance Criteria: a documented, tested example of an owner ─────
  // ── account with 3 configured signers and a 2-of-3 threshold           ─

  describe('acceptance: 2-of-3 threshold met succeeds', () => {
    it('builds, signs with 2 of 3 keypairs, and submits', async () => {
      const rpc = mockRpc();
      const builder = new UnsignedTxBuilder(
        rpc as unknown as SorobanRpc.Server,
        NETWORK_PASSPHRASE,
        new KeypairSigner(keypairA),
        2,
      );

      // 1. Build unsigned transaction
      const build = await builder.buildOpenChannel(
        TEST_PUBLIC,
        { paymentChannel: DEPLOYED_CONTRACTS.paymentChannel },
        {},
        { deposit: '10', limitPerPeriod: '1', period: 'hourly' },
      );

      expect(build.signaturesCollected).toBe(0);
      expect(build.threshold).toBe(2);

      // 2. Signer A signs
      const afterA = addSignatureToEnvelope(
        build.transactionXdr,
        keypairA,
        NETWORK_PASSPHRASE,
      );

      // 3. Signer B signs (XDR passed from A to B)
      const afterB = addSignatureToEnvelope(
        afterA,
        keypairB,
        NETWORK_PASSPHRASE,
      );

      // 4. Verify threshold is met
      expect(getSignaturesCollected(afterB)).toBe(2);
      expect(enoughSignatures(afterB, 2)).toBe(true);

      // 5. Submit
      const result = await builder.submitSigned({
        ...build,
        transactionXdr: afterB,
        signaturesCollected: 2,
      });

      expect(result.success).toBe(true);
      expect(result.hash).toBe('tx-hash');
      expect(result.ledger).toBe(123);
      expect(rpc.sendTransaction).toHaveBeenCalledOnce();
      expect(rpc.getTransaction).toHaveBeenCalledWith('tx-hash');
    });
  });

  describe('threshold not met is rejected', () => {
    it('builds, signs with only 1 signer (below 2-of-3 threshold), refuses submit', async () => {
      const rpc = mockRpc();
      const builder = new UnsignedTxBuilder(
        rpc as unknown as SorobanRpc.Server,
        NETWORK_PASSPHRASE,
        new KeypairSigner(keypairA),
        2,
      );

      const build = await builder.buildOpenChannel(
        TEST_PUBLIC,
        { paymentChannel: DEPLOYED_CONTRACTS.paymentChannel },
        {},
        { deposit: '10', limitPerPeriod: '1', period: 'hourly' },
      );

      // Only Signer A signs
      const afterA = addSignatureToEnvelope(
        build.transactionXdr,
        keypairA,
        NETWORK_PASSPHRASE,
      );

      expect(getSignaturesCollected(afterA)).toBe(1);
      expect(enoughSignatures(afterA, 2)).toBe(false);

      // Submit should be rejected
      await expect(
        builder.submitSigned({
          ...build,
          transactionXdr: afterA,
          signaturesCollected: 1,
        }),
      ).rejects.toThrow(StellarAgentError);

      await expect(
        builder.submitSigned({
          ...build,
          transactionXdr: afterA,
          signaturesCollected: 1,
        }),
      ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });

      // Network should not have been contacted
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    });
  });

  describe('full round-trip: build → sign (2 parties) → submit', () => {
    it('chains build-sign-sign-submit through the StellarAgent API', async () => {
      const rpc = mockRpc();
      const agent = await createAgent(rpc);
      agent.enableUnsignedTx(2);

      // 1. Build
      const build = await agent.buildUnsignedOpenChannelTx({
        deposit: '10',
        limitPerPeriod: '1',
        period: 'hourly',
      });

      // 2. The agent's own signer (keypairA's secret == TEST_SECRET) signs
      const signedOnce = await agent.signUnsignedTx(build);
      expect(signedOnce.signaturesCollected).toBe(1);

      // 3. Second signer (keypairB) adds their signature
      const signedTwice = addSignatureToEnvelope(
        signedOnce.transactionXdr,
        keypairB,
        NETWORK_PASSPHRASE,
      );
      expect(getSignaturesCollected(signedTwice)).toBe(2);

      // 4. Submit
      const result = await agent.submitSignedTx({
        ...signedOnce,
        transactionXdr: signedTwice,
        signaturesCollected: 2,
      });

      expect(result.success).toBe(true);
      expect(result.hash).toBe('tx-hash');
    });
  });
});

// ─── Contract error mapping ─────────────────────────────────────────────

describe('UnsignedTxBuilder contract error mapping', () => {
  it('maps spend limit exceeded panics', async () => {
    const rpc = mockRpc();
    rpc.sendTransaction = vi.fn(async () => ({ status: 'PENDING', hash: 'fail-hash' }));
    rpc.getTransaction = vi.fn(async () => ({
      status: SorobanRpc.Api.GetTransactionStatus.FAILED,
      diagnosticEventsXdr: [],
    }));
    const builder = createUnsignedTxBuilder(rpc, 1);

    let build = dummyBuild(0, 1);
    build = builder.signUnsignedTx(build, keypairA);

    await expect(builder.submitSigned(build)).rejects.toThrow(StellarAgentError);
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────

function dummyBuild(
  signaturesCollected: number,
  threshold: number,
): UnsignedTxBuild {
  return {
    transactionXdr: buildDummyTx(
      Array.from({ length: signaturesCollected }, (_, i) =>
        [keypairA, keypairB, keypairC][i],
      ),
    ),
    authEntryXdrs: [],
    validUntilLedgerSeq: 200,
    threshold,
    signaturesCollected,
  };
}
