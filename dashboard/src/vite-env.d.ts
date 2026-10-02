interface ImportMetaEnv {
  readonly VITE_INDEXER_URL?: string;
  readonly VITE_STELLAR_EXPERT_NETWORK?: string;
  /** Network the read-only `StellarAgent` instance connects to. */
  readonly VITE_STELLAR_NETWORK?: string;
  readonly VITE_CONTRACT_PAYMENT_CHANNEL?: string;
  readonly VITE_CONTRACT_ESCROW?: string;
  readonly VITE_CONTRACT_RATE_LIMITER?: string;
  readonly VITE_CONTRACT_AGENT_WALLET_FACTORY?: string;
  readonly VITE_CONTRACT_CIRCUIT_BREAKER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
