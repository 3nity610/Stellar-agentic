[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / AgentBid

# Interface: AgentBid

Defined in: [math/bid.ts:42](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L42)

A single agent's bid for an escrow job

## Properties

### agentAddress

> **agentAddress**: `string`

Defined in: [math/bid.ts:44](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L44)

Unique agent address

***

### price

> **price**: `string`

Defined in: [math/bid.ts:49](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L49)

Price the agent is willing to accept for the job.
Must be a decimal string (e.g. "0.05") — never a JS number.

***

### reputation

> **reputation**: `string`

Defined in: [math/bid.ts:54](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L54)

Agent's reputation score 0–100 (integer or decimal string).
Sourced from on-chain historical data.

***

### estimatedLatencySeconds

> **estimatedLatencySeconds**: `string`

Defined in: [math/bid.ts:59](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L59)

Expected task completion time in seconds (decimal string).
Lower is better.

***

### successRate

> **successRate**: `string`

Defined in: [math/bid.ts:64](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L64)

Lifetime success rate as a decimal fraction 0–1 (e.g. "0.97").
Computed as successfulJobs / totalJobs.
