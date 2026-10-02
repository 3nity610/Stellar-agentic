[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / useSpendReport

# Function: useSpendReport()

> **useSpendReport**(`options?`): [`UseSpendReportResult`](../interfaces/UseSpendReportResult.md)

Defined in: [hooks/useSpendReport.ts:50](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useSpendReport.ts#L50)

Polls `PaymentChannel.remaining_this_period` (and friends) for the
agent's active channel, with any in-flight `usePayForAPI()` payments
from anywhere else in the tree overlaid optimistically — see
`applyPending`. Reconciles automatically: `usePayForAPI` bumps a shared
version counter on settle, which forces every mounted `useSpendReport`
to refetch immediately rather than waiting out the poll interval.

## Parameters

### options?

[`UsePollingOptions`](../interfaces/UsePollingOptions.md)

## Returns

[`UseSpendReportResult`](../interfaces/UseSpendReportResult.md)
