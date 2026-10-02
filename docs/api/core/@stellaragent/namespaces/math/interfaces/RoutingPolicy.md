[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / RoutingPolicy

# Interface: RoutingPolicy

Defined in: [math/routing.ts:11](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L11)

## Properties

### costWeight

> **costWeight**: `number`

Defined in: [math/routing.ts:13](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L13)

Relative weight of source-normalized fees.

***

### slippageWeight

> **slippageWeight**: `number`

Defined in: [math/routing.ts:15](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L15)

Relative weight of expected price impact.

***

### reliabilityWeight

> **reliabilityWeight**: `number`

Defined in: [math/routing.ts:17](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L17)

Relative weight of the reliability shortfall.

***

### hopPenalty

> **hopPenalty**: `number`

Defined in: [math/routing.ts:19](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L19)

Fixed score added for every economic hop after the first.

***

### maxSlippageBps

> **maxSlippageBps**: `number`

Defined in: [math/routing.ts:21](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L21)

Routes above this expected slippage are inadmissible.

***

### minReliabilityBps

> **minReliabilityBps**: `number`

Defined in: [math/routing.ts:23](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L23)

Routes below this reliability are inadmissible.
