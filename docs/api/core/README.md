**@stellaragent/core**

***

# @stellaragent/core

## Namespaces

- [math](@stellaragent/namespaces/math/README.md)

## Classes

- [StellarAgent](classes/StellarAgent.md)
- [CircuitBreaker](classes/CircuitBreaker.md)
- [ContractsNotDeployedError](classes/ContractsNotDeployedError.md)
- [StellarAgentError](classes/StellarAgentError.md)
- [ChannelPoolError](classes/ChannelPoolError.md)
- [ChannelAccountPool](classes/ChannelAccountPool.md)
- [FixedFeeStrategy](classes/FixedFeeStrategy.md)
- [MultiplierFeeStrategy](classes/MultiplierFeeStrategy.md)
- [CallbackFeeStrategy](classes/CallbackFeeStrategy.md)
- [RecentFeeStrategy](classes/RecentFeeStrategy.md)
- [SponsorshipError](classes/SponsorshipError.md)
- [SponsorService](classes/SponsorService.md)
- [SponsoredChannelAccountFactory](classes/SponsoredChannelAccountFactory.md)
- [SubmissionQueueError](classes/SubmissionQueueError.md)
- [SubmissionQueue](classes/SubmissionQueue.md)
- [RouteUnavailableError](classes/RouteUnavailableError.md)
- [RoutePlanner](classes/RoutePlanner.md)
- [DirectRouteProvider](classes/DirectRouteProvider.md)
- [AmmRouteProvider](classes/AmmRouteProvider.md)
- [StellarPathPaymentProvider](classes/StellarPathPaymentProvider.md)
- [CallbackRouteProvider](classes/CallbackRouteProvider.md)
- [SigningError](classes/SigningError.md)
- [KeypairSigner](classes/KeypairSigner.md)
- [RemoteSigner](classes/RemoteSigner.md)
- [SignerAdapter](classes/SignerAdapter.md)
- [RedactingLogger](classes/RedactingLogger.md)
- [InMemoryMetrics](classes/InMemoryMetrics.md)
- [InMemoryTracer](classes/InMemoryTracer.md)

## Interfaces

- [SolvencyVerifyingKey](interfaces/SolvencyVerifyingKey.md)
- [SolvencyProof](interfaces/SolvencyProof.md)
- [CircuitBreakerOptions](interfaces/CircuitBreakerOptions.md)
- [ChannelAccount](interfaces/ChannelAccount.md)
- [ChannelAccountFactory](interfaces/ChannelAccountFactory.md)
- [ChannelAccountPoolOptions](interfaces/ChannelAccountPoolOptions.md)
- [LeaseOptions](interfaces/LeaseOptions.md)
- [ChannelPoolStats](interfaces/ChannelPoolStats.md)
- [ChannelAccountLease](interfaces/ChannelAccountLease.md)
- [FeeDistribution](interfaces/FeeDistribution.md)
- [FeeStats](interfaces/FeeStats.md)
- [FeeContext](interfaces/FeeContext.md)
- [FeeStrategy](interfaces/FeeStrategy.md)
- [RecentFeeStrategyOptions](interfaces/RecentFeeStrategyOptions.md)
- [SponsorRpc](interfaces/SponsorRpc.md)
- [SponsorServiceOptions](interfaces/SponsorServiceOptions.md)
- [SponsoredAccountOptions](interfaces/SponsoredAccountOptions.md)
- [SponsorshipRecord](interfaces/SponsorshipRecord.md)
- [SubmissionQueueOptions](interfaces/SubmissionQueueOptions.md)
- [SubmitOptions](interfaces/SubmitOptions.md)
- [SubmissionQueueStats](interfaces/SubmissionQueueStats.md)
- [RawSolvencyVerifyingKey](interfaces/RawSolvencyVerifyingKey.md)
- [RawSolvencyProof](interfaces/RawSolvencyProof.md)
- [LedgerCloseSample](interfaces/LedgerCloseSample.md)
- [LedgerCloseEstimate](interfaces/LedgerCloseEstimate.md)
- [RoutePlannerOptions](interfaces/RoutePlannerOptions.md)
- [PaymentQuoteRequest](interfaces/PaymentQuoteRequest.md)
- [PaymentQuote](interfaces/PaymentQuote.md)
- [RouteHop](interfaces/RouteHop.md)
- [RouteQuote](interfaces/RouteQuote.md)
- [RouteRequest](interfaces/RouteRequest.md)
- [RouteProviderContext](interfaces/RouteProviderContext.md)
- [RouteProvider](interfaces/RouteProvider.md)
- [RoutePriceOracle](interfaces/RoutePriceOracle.md)
- [OracleReference](interfaces/OracleReference.md)
- [RouteDiscoveryOptions](interfaces/RouteDiscoveryOptions.md)
- [RouteDiscoveryFailure](interfaces/RouteDiscoveryFailure.md)
- [RouteDiscoveryResult](interfaces/RouteDiscoveryResult.md)
- [AmmPair](interfaces/AmmPair.md)
- [AmmHopQuote](interfaces/AmmHopQuote.md)
- [PathPaymentCandidate](interfaces/PathPaymentCandidate.md)
- [SignTransactionOptions](interfaces/SignTransactionOptions.md)
- [SignAuthEntryOptions](interfaces/SignAuthEntryOptions.md)
- [Signer](interfaces/Signer.md)
- [RemoteSignerOptions](interfaces/RemoteSignerOptions.md)
- [Sep43Like](interfaces/Sep43Like.md)
- [PaymentTraceRecord](interfaces/PaymentTraceRecord.md)
- [TelemetryConfig](interfaces/TelemetryConfig.md)
- [TelemetryContext](interfaces/TelemetryContext.md)
- [Logger](interfaces/Logger.md)
- [Metrics](interfaces/Metrics.md)
- [OtelBridgeOptions](interfaces/OtelBridgeOptions.md)
- [Tracer](interfaces/Tracer.md)
- [RecordedSpan](interfaces/RecordedSpan.md)
- [NetworkConfig](interfaces/NetworkConfig.md)
- [SpendLimit](interfaces/SpendLimit.md)
- [StellarAgentConfig](interfaces/StellarAgentConfig.md)
- [QuoteParams](interfaces/QuoteParams.md)
- [FeeBumpConfig](interfaces/FeeBumpConfig.md)
- [SubmissionPipelineConfig](interfaces/SubmissionPipelineConfig.md)
- [AgentInfo](interfaces/AgentInfo.md)
- [OpenChannelParams](interfaces/OpenChannelParams.md)
- [PayForAPIParams](interfaces/PayForAPIParams.md)
- [ChannelInfo](interfaces/ChannelInfo.md)
- [SpendReport](interfaces/SpendReport.md)
- [RequestWorkParams](interfaces/RequestWorkParams.md)
- [JobInfo](interfaces/JobInfo.md)
- [RateLimitConfig](interfaces/RateLimitConfig.md)
- [RateLimitStatus](interfaces/RateLimitStatus.md)
- [ContractAddresses](interfaces/ContractAddresses.md)
- [AgentEvent](interfaces/AgentEvent.md)
- [TxResult](interfaces/TxResult.md)

## Type Aliases

- [SolvencyG1Point](type-aliases/SolvencyG1Point.md)
- [SolvencyG2Point](type-aliases/SolvencyG2Point.md)
- [PublicAddress](type-aliases/PublicAddress.md)
- [ContractKey](type-aliases/ContractKey.md)
- [StellarAgentErrorCode](type-aliases/StellarAgentErrorCode.md)
- [ChannelLeaseOutcome](type-aliases/ChannelLeaseOutcome.md)
- [FeePhase](type-aliases/FeePhase.md)
- [FeePercentile](type-aliases/FeePercentile.md)
- [FeeCallback](type-aliases/FeeCallback.md)
- [RetryClassification](type-aliases/RetryClassification.md)
- [RetryClassifier](type-aliases/RetryClassifier.md)
- [RouteVenue](type-aliases/RouteVenue.md)
- [RouteUnavailableCode](type-aliases/RouteUnavailableCode.md)
- [AmmQuoteCallback](type-aliases/AmmQuoteCallback.md)
- [PathPaymentQuoteCallback](type-aliases/PathPaymentQuoteCallback.md)
- [Network](type-aliases/Network.md)
- [SpendPeriod](type-aliases/SpendPeriod.md)
- [JobStatus](type-aliases/JobStatus.md)

## Variables

- [FP\_SIZE](variables/FP_SIZE.md)
- [G1\_POINT\_SIZE](variables/G1_POINT_SIZE.md)
- [FP2\_SIZE](variables/FP2_SIZE.md)
- [G2\_POINT\_SIZE](variables/G2_POINT_SIZE.md)
- [FR\_SIZE](variables/FR_SIZE.md)
- [SOLVENCY\_PUBLIC\_INPUTS](variables/SOLVENCY_PUBLIC_INPUTS.md)
- [GAMMA\_ABC\_G1\_SIZE](variables/GAMMA_ABC_G1_SIZE.md)
- [SOROBAN\_G1\_GENERATOR](variables/SOROBAN_G1_GENERATOR.md)
- [CONTRACT\_KEYS](variables/CONTRACT_KEYS.md)
- [UNCONFIGURED\_CONTRACTS](variables/UNCONFIGURED_CONTRACTS.md)
- [FALLBACK\_LEDGER\_CLOSE\_SECONDS](variables/FALLBACK_LEDGER_CLOSE_SECONDS.md)
- [noopLogger](variables/noopLogger.md)
- [noopMetrics](variables/noopMetrics.md)
- [SEMCONV\_VERSION](variables/SEMCONV_VERSION.md)
- [SemConv](variables/SemConv.md)
- [SpanNames](variables/SpanNames.md)
- [MetricNames](variables/MetricNames.md)
- [noopTracer](variables/noopTracer.md)

## Functions

- [toSolvencyG1](functions/toSolvencyG1.md)
- [toSolvencyG2](functions/toSolvencyG2.md)
- [g1Generator](functions/g1Generator.md)
- [g1Infinity](functions/g1Infinity.md)
- [solvencyVerifyingKeyVal](functions/solvencyVerifyingKeyVal.md)
- [solvencyProofVal](functions/solvencyProofVal.md)
- [setSolvencyVk](functions/setSolvencyVk.md)
- [verifySolvencyProof](functions/verifySolvencyProof.md)
- [asPublicAddress](functions/asPublicAddress.md)
- [isDeployedAddress](functions/isDeployedAddress.md)
- [envVarNames](functions/envVarNames.md)
- [resolveContracts](functions/resolveContracts.md)
- [assertDeployed](functions/assertDeployed.md)
- [asFeeStrategy](functions/asFeeStrategy.md)
- [classifySubmissionError](functions/classifySubmissionError.md)
- [decodeSolvencyVerifyingKey](functions/decodeSolvencyVerifyingKey.md)
- [decodeSolvencyProof](functions/decodeSolvencyProof.md)
- [estimateLedgerCloseSeconds](functions/estimateLedgerCloseSeconds.md)
- [estimateSecondsRemaining](functions/estimateSecondsRemaining.md)
- [fetchLedgerCloseEstimate](functions/fetchLedgerCloseEstimate.md)
- [discoverRoutes](functions/discoverRoutes.md)
- [canonicalRouteId](functions/canonicalRouteId.md)
- [normalizeRoute](functions/normalizeRoute.md)
- [applyOracleReference](functions/applyOracleReference.md)
- [isSigner](functions/isSigner.md)
- [createPaymentId](functions/createPaymentId.md)
- [registerPaymentTrace](functions/registerPaymentTrace.md)
- [attachTransactionHash](functions/attachTransactionHash.md)
- [lookupPaymentIdByTxHash](functions/lookupPaymentIdByTxHash.md)
- [getPaymentTrace](functions/getPaymentTrace.md)
- [clearPaymentTraceRegistry](functions/clearPaymentTraceRegistry.md)
- [activePaymentTraceCount](functions/activePaymentTraceCount.md)
- [getTelemetry](functions/getTelemetry.md)
- [createTelemetry](functions/createTelemetry.md)
- [initTelemetry](functions/initTelemetry.md)
- [redactForExport](functions/redactForExport.md)
- [createOtelBridge](functions/createOtelBridge.md)

## References

### bn

Re-exports [bn](@stellaragent/namespaces/math/functions/bn.md)

***

### add

Re-exports [add](@stellaragent/namespaces/math/functions/add.md)

***

### sub

Re-exports [sub](@stellaragent/namespaces/math/functions/sub.md)

***

### mul

Re-exports [mul](@stellaragent/namespaces/math/functions/mul.md)

***

### div

Re-exports [div](@stellaragent/namespaces/math/functions/div.md)

***

### pct

Re-exports [pct](@stellaragent/namespaces/math/functions/pct.md)

***

### clamp

Re-exports [clamp](@stellaragent/namespaces/math/functions/clamp.md)

***

### sumStrings

Re-exports [sumStrings](@stellaragent/namespaces/math/functions/sumStrings.md)

***

### toStroops

Re-exports [toStroops](@stellaragent/namespaces/math/functions/toStroops.md)

***

### fromStroops

Re-exports [fromStroops](@stellaragent/namespaces/math/functions/fromStroops.md)

***

### fmt

Re-exports [fmt](@stellaragent/namespaces/math/functions/fmt.md)

***

### toStr

Re-exports [toStr](@stellaragent/namespaces/math/functions/toStr.md)

***

### gt

Re-exports [gt](@stellaragent/namespaces/math/functions/gt.md)

***

### gte

Re-exports [gte](@stellaragent/namespaces/math/functions/gte.md)

***

### lt

Re-exports [lt](@stellaragent/namespaces/math/functions/lt.md)

***

### lte

Re-exports [lte](@stellaragent/namespaces/math/functions/lte.md)

***

### eq

Re-exports [eq](@stellaragent/namespaces/math/functions/eq.md)

***

### isZero

Re-exports [isZero](@stellaragent/namespaces/math/functions/isZero.md)

***

### isPositive

Re-exports [isPositive](@stellaragent/namespaces/math/functions/isPositive.md)

***

### STROOP\_SCALE

Re-exports [STROOP_SCALE](@stellaragent/namespaces/math/variables/STROOP_SCALE.md)

***

### BPS\_SCALE

Re-exports [BPS_SCALE](@stellaragent/namespaces/math/variables/BPS_SCALE.md)

***

### scoreBid

Re-exports [scoreBid](@stellaragent/namespaces/math/functions/scoreBid.md)

***

### rankBids

Re-exports [rankBids](@stellaragent/namespaces/math/functions/rankBids.md)

***

### selectBestBid

Re-exports [selectBestBid](@stellaragent/namespaces/math/functions/selectBestBid.md)

***

### isWithinSpendLimit

Re-exports [isWithinSpendLimit](@stellaragent/namespaces/math/functions/isWithinSpendLimit.md)

***

### remainingBudget

Re-exports [remainingBudget](@stellaragent/namespaces/math/functions/remainingBudget.md)

***

### DEFAULT\_BID\_WEIGHTS

Re-exports [DEFAULT_BID_WEIGHTS](@stellaragent/namespaces/math/variables/DEFAULT_BID_WEIGHTS.md)

***

### attestRankBids

Re-exports [attestRankBids](@stellaragent/namespaces/math/functions/attestRankBids.md)

***

### verifyBidAttestation

Re-exports [verifyBidAttestation](@stellaragent/namespaces/math/functions/verifyBidAttestation.md)

***

### predictPaymentOutcome

Re-exports [predictPaymentOutcome](@stellaragent/namespaces/math/functions/predictPaymentOutcome.md)

***

### isWindowExpired

Re-exports [isWindowExpired](@stellaragent/namespaces/math/functions/isWindowExpired.md)

***

### ledgersRemainingInWindow

Re-exports [ledgersRemainingInWindow](@stellaragent/namespaces/math/functions/ledgersRemainingInWindow.md)

***

### LEDGERS\_PER\_CHANNEL\_PERIOD

Re-exports [LEDGERS_PER_CHANNEL_PERIOD](@stellaragent/namespaces/math/variables/LEDGERS_PER_CHANNEL_PERIOD.md)

***

### RATE\_LIMIT\_LEDGERS\_PER\_HOUR

Re-exports [RATE_LIMIT_LEDGERS_PER_HOUR](@stellaragent/namespaces/math/variables/RATE_LIMIT_LEDGERS_PER_HOUR.md)

***

### RATE\_LIMIT\_LEDGERS\_PER\_DAY

Re-exports [RATE_LIMIT_LEDGERS_PER_DAY](@stellaragent/namespaces/math/variables/RATE_LIMIT_LEDGERS_PER_DAY.md)

***

### ROUTING\_WEIGHT\_SCALE

Re-exports [ROUTING_WEIGHT_SCALE](@stellaragent/namespaces/math/variables/ROUTING_WEIGHT_SCALE.md)

***

### DEFAULT\_ROUTING\_POLICY

Re-exports [DEFAULT_ROUTING_POLICY](@stellaragent/namespaces/math/variables/DEFAULT_ROUTING_POLICY.md)

***

### scoreRoute

Re-exports [scoreRoute](@stellaragent/namespaces/math/functions/scoreRoute.md)

***

### isRouteEligible

Re-exports [isRouteEligible](@stellaragent/namespaces/math/functions/isRouteEligible.md)

***

### rankRoutes

Re-exports [rankRoutes](@stellaragent/namespaces/math/functions/rankRoutes.md)

***

### selectRoute

Re-exports [selectRoute](@stellaragent/namespaces/math/functions/selectRoute.md)

***

### validateRoutingPolicy

Re-exports [validateRoutingPolicy](@stellaragent/namespaces/math/functions/validateRoutingPolicy.md)

***

### AgentBid

Re-exports [AgentBid](@stellaragent/namespaces/math/interfaces/AgentBid.md)

***

### BidWeights

Re-exports [BidWeights](@stellaragent/namespaces/math/interfaces/BidWeights.md)

***

### ScoredBid

Re-exports [ScoredBid](@stellaragent/namespaces/math/interfaces/ScoredBid.md)

***

### BidAttestation

Re-exports [BidAttestation](@stellaragent/namespaces/math/interfaces/BidAttestation.md)

***

### AttestRankBidsOptions

Re-exports [AttestRankBidsOptions](@stellaragent/namespaces/math/interfaces/AttestRankBidsOptions.md)

***

### AttestedRanking

Re-exports [AttestedRanking](@stellaragent/namespaces/math/interfaces/AttestedRanking.md)

***

### ScorerKeyRecord

Re-exports [ScorerKeyRecord](@stellaragent/namespaces/math/interfaces/ScorerKeyRecord.md)

***

### ScorerKeyDirectory

Re-exports [ScorerKeyDirectory](@stellaragent/namespaces/math/type-aliases/ScorerKeyDirectory.md)

***

### VerifyBidAttestationOptions

Re-exports [VerifyBidAttestationOptions](@stellaragent/namespaces/math/interfaces/VerifyBidAttestationOptions.md)

***

### BidAttestationVerification

Re-exports [BidAttestationVerification](@stellaragent/namespaces/math/type-aliases/BidAttestationVerification.md)

***

### ChannelSpendState

Re-exports [ChannelSpendState](@stellaragent/namespaces/math/interfaces/ChannelSpendState.md)

***

### RateLimitSpendState

Re-exports [RateLimitSpendState](@stellaragent/namespaces/math/interfaces/RateLimitSpendState.md)

***

### PredictPaymentOutcomeParams

Re-exports [PredictPaymentOutcomeParams](@stellaragent/namespaces/math/interfaces/PredictPaymentOutcomeParams.md)

***

### PaymentPrediction

Re-exports [PaymentPrediction](@stellaragent/namespaces/math/interfaces/PaymentPrediction.md)

***

### BlockReason

Re-exports [BlockReason](@stellaragent/namespaces/math/type-aliases/BlockReason.md)

***

### RoutingPolicy

Re-exports [RoutingPolicy](@stellaragent/namespaces/math/interfaces/RoutingPolicy.md)

***

### RouteScoreBreakdown

Re-exports [RouteScoreBreakdown](@stellaragent/namespaces/math/interfaces/RouteScoreBreakdown.md)

***

### ScoredRoute

Re-exports [ScoredRoute](@stellaragent/namespaces/math/interfaces/ScoredRoute.md)
