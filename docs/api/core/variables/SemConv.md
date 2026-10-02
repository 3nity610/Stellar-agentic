[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SemConv

# Variable: SemConv

> `const` **SemConv**: `object`

Defined in: [telemetry/semantic.ts:13](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/semantic.ts#L13)

## Type Declaration

### version

> `readonly` **version**: `"stellaragent.semconv.version"`

### agent

> `readonly` **agent**: `object`

#### agent.id

> `readonly` **id**: `"stellaragent.agent.id"`

#### agent.address

> `readonly` **address**: `"stellaragent.agent.address"`

#### agent.name

> `readonly` **name**: `"stellaragent.agent.name"`

### channel

> `readonly` **channel**: `object`

#### channel.id

> `readonly` **id**: `"stellaragent.channel.id"`

### job

> `readonly` **job**: `object`

#### job.id

> `readonly` **id**: `"stellaragent.job.id"`

#### job.status

> `readonly` **status**: `"stellaragent.job.status"`

### contract

> `readonly` **contract**: `object`

#### contract.id

> `readonly` **id**: `"stellaragent.contract.id"`

#### contract.method

> `readonly` **method**: `"stellaragent.contract.method"`

#### contract.kind

> `readonly` **kind**: `"stellaragent.contract.kind"`

### network

> `readonly` **network**: `"stellaragent.network"`

### payment

> `readonly` **payment**: `object`

#### payment.amount

> `readonly` **amount**: `"stellaragent.payment.amount"`

#### payment.asset

> `readonly` **asset**: `"stellaragent.payment.asset"`

#### payment.endpoint

> `readonly` **endpoint**: `"stellaragent.payment.endpoint"`

#### payment.recipient

> `readonly` **recipient**: `"stellaragent.payment.recipient"`

### transaction

> `readonly` **transaction**: `object`

#### transaction.hash

> `readonly` **hash**: `"stellaragent.transaction.hash"`

#### transaction.ledger

> `readonly` **ledger**: `"stellaragent.transaction.ledger"`

### error

> `readonly` **error**: `object`

#### error.code

> `readonly` **code**: `"stellaragent.error.code"`

### indexer

> `readonly` **indexer**: `object`

#### indexer.fromLedger

> `readonly` **fromLedger**: `"stellaragent.indexer.from_ledger"`

#### indexer.throughLedger

> `readonly` **throughLedger**: `"stellaragent.indexer.through_ledger"`

#### indexer.eventCount

> `readonly` **eventCount**: `"stellaragent.indexer.event_count"`

#### indexer.lagLedgers

> `readonly` **lagLedgers**: `"stellaragent.indexer.lag_ledgers"`

#### indexer.decodeFailures

> `readonly` **decodeFailures**: `"stellaragent.indexer.decode_failures"`

### trace

> `readonly` **trace**: `object`

#### trace.paymentId

> `readonly` **paymentId**: `"stellaragent.trace.payment_id"`
