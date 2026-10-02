[**@stellaragent/core**](../../../README.md)

***

[@stellaragent/core](../../../README.md) / math

# math

## Interfaces

- [BidAttestation](interfaces/BidAttestation.md)
- [AttestRankBidsOptions](interfaces/AttestRankBidsOptions.md)
- [AttestedRanking](interfaces/AttestedRanking.md)
- [ScorerKeyRecord](interfaces/ScorerKeyRecord.md)
- [VerifyBidAttestationOptions](interfaces/VerifyBidAttestationOptions.md)
- [AgentBid](interfaces/AgentBid.md)
- [BidWeights](interfaces/BidWeights.md)
- [ScoredBid](interfaces/ScoredBid.md)
- [ChannelSpendState](interfaces/ChannelSpendState.md)
- [RateLimitSpendState](interfaces/RateLimitSpendState.md)
- [PredictPaymentOutcomeParams](interfaces/PredictPaymentOutcomeParams.md)
- [PaymentPrediction](interfaces/PaymentPrediction.md)
- [RoutingPolicy](interfaces/RoutingPolicy.md)
- [RouteScoreBreakdown](interfaces/RouteScoreBreakdown.md)
- [ScoredRoute](interfaces/ScoredRoute.md)

## Type Aliases

- [ScorerKeyDirectory](type-aliases/ScorerKeyDirectory.md)
- [BidAttestationVerification](type-aliases/BidAttestationVerification.md)
- [BlockReason](type-aliases/BlockReason.md)

## Variables

- [DEFAULT\_BID\_WEIGHTS](variables/DEFAULT_BID_WEIGHTS.md)
- [STROOP\_SCALE](variables/STROOP_SCALE.md)
- [BPS\_SCALE](variables/BPS_SCALE.md)
- [LEDGERS\_PER\_CHANNEL\_PERIOD](variables/LEDGERS_PER_CHANNEL_PERIOD.md)
- [RATE\_LIMIT\_LEDGERS\_PER\_HOUR](variables/RATE_LIMIT_LEDGERS_PER_HOUR.md)
- [RATE\_LIMIT\_LEDGERS\_PER\_DAY](variables/RATE_LIMIT_LEDGERS_PER_DAY.md)
- [ROUTING\_WEIGHT\_SCALE](variables/ROUTING_WEIGHT_SCALE.md)
- [DEFAULT\_ROUTING\_POLICY](variables/DEFAULT_ROUTING_POLICY.md)

## Functions

- [attestRankBids](functions/attestRankBids.md)
- [verifyBidAttestation](functions/verifyBidAttestation.md)
- [scoreBid](functions/scoreBid.md)
- [rankBids](functions/rankBids.md)
- [selectBestBid](functions/selectBestBid.md)
- [isWithinSpendLimit](functions/isWithinSpendLimit.md)
- [remainingBudget](functions/remainingBudget.md)
- [bn](functions/bn.md)
- [add](functions/add.md)
- [sub](functions/sub.md)
- [mul](functions/mul.md)
- [div](functions/div.md)
- [pct](functions/pct.md)
- [clamp](functions/clamp.md)
- [sumStrings](functions/sumStrings.md)
- [toStroops](functions/toStroops.md)
- [fromStroops](functions/fromStroops.md)
- [fmt](functions/fmt.md)
- [toStr](functions/toStr.md)
- [gt](functions/gt.md)
- [gte](functions/gte.md)
- [lt](functions/lt.md)
- [lte](functions/lte.md)
- [eq](functions/eq.md)
- [isZero](functions/isZero.md)
- [isPositive](functions/isPositive.md)
- [isWindowExpired](functions/isWindowExpired.md)
- [ledgersRemainingInWindow](functions/ledgersRemainingInWindow.md)
- [predictPaymentOutcome](functions/predictPaymentOutcome.md)
- [scoreRoute](functions/scoreRoute.md)
- [isRouteEligible](functions/isRouteEligible.md)
- [rankRoutes](functions/rankRoutes.md)
- [selectRoute](functions/selectRoute.md)
- [validateRoutingPolicy](functions/validateRoutingPolicy.md)
