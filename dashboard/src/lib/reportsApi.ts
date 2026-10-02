export type ReportSubjectKind = 'agent' | 'owner';
export type ReportFormat = 'csv' | 'json' | 'iif';
export type ReportCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type DeliveryStatus = 'pending' | 'delivering' | 'retry' | 'delivered' | 'dead_letter';

export interface ReportSubject {
  kind: ReportSubjectKind;
  id: string;
}

export interface StatementPeriod {
  fromLedger?: number;
  throughLedger?: number;
  fromTimestamp?: string;
  throughTimestamp?: string;
}

export interface StatementRequest {
  subject: ReportSubject;
  period: StatementPeriod;
}

export interface BalancePosition {
  account: string;
  asset: string;
  amount: string;
}

export interface ReconciliationRequest {
  fromLedger?: number;
  asOfLedger: number;
  openingPositions?: BalancePosition[];
  onChainPositions: BalancePosition[];
  accounts?: string[];
}

export interface StatementLine {
  lineId: string;
  entryId: string;
  eventId: string | null;
  txHash: string;
  ledger: number;
  ledgerClosedAt: string;
  kind: string;
  category: 'funding' | 'payment' | 'conversion' | 'refund' | 'escrow' | 'fee';
  direction: 'credit' | 'debit' | 'neutral';
  counterparty: string | null;
  memo: string | null;
  referenceType: string;
  referenceId: string;
  asset: string;
  amount: string;
  signedAmount: string;
  destinationAsset: string | null;
  destinationAmount: string | null;
  runningBalance: string;
}

export interface StatementPosition {
  asset: string;
  openingAmount: string;
  credits: string;
  debits: string;
  closingAmount: string;
}

export interface StatementCategoryTotal {
  dimension: 'counterparty' | 'asset' | 'payment_type';
  key: string;
  asset: string;
  count: number;
  credits: string;
  debits: string;
  net: string;
}

export interface Statement {
  statementId: string;
  subject: ReportSubject;
  period: StatementPeriod;
  lines: StatementLine[];
  positions: StatementPosition[];
  categories: StatementCategoryTotal[];
  evidence: {
    entryCount: number;
    transactionCount: number;
    transactionHashes: string[];
    firstLedger: number | null;
    lastLedger: number | null;
  };
  reconciliation: null | {
    fromLedger: number;
    asOfLedger: number;
    reconciled: boolean;
    checkedEntries: number;
    lines: Array<{
      account: string;
      asset: string;
      expectedAmount: string;
      onChainAmount: string | null;
      difference: string | null;
      status: 'matched' | 'discrepancy' | 'missing_on_chain';
    }>;
  };
}

export interface WebhookDestination {
  id: string;
  kind: 'webhook';
  url: string;
  headers?: Record<string, string>;
}

export interface EmailDestination {
  id: string;
  kind: 'email';
  to: string[];
  from?: string;
  subject?: string;
}

export type ReportDestination = WebhookDestination | EmailDestination;

export interface ReportScheduleInput {
  scheduleId: string;
  subject: ReportSubject;
  cadence: ReportCadence;
  format: ReportFormat;
  destinations: ReportDestination[];
  nextRunAt: string;
  enabled?: boolean;
}

export interface ReportSchedule extends ReportScheduleInput {
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDelivery {
  deliveryId: string;
  artifactId: string;
  scheduleId: string;
  runKey: string;
  destination: ReportDestination;
  idempotencyKey: string;
  status: DeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string;
  leaseUntil: string | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportsFetch {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

function queryForPeriod(period: StatementPeriod, format?: ReportFormat): string {
  const query = new URLSearchParams();
  if (period.fromLedger !== undefined) query.set('fromLedger', String(period.fromLedger));
  if (period.throughLedger !== undefined) query.set('throughLedger', String(period.throughLedger));
  if (period.fromTimestamp) query.set('fromTimestamp', period.fromTimestamp);
  if (period.throughTimestamp) query.set('throughTimestamp', period.throughTimestamp);
  if (format) query.set('format', format);
  const value = query.toString();
  return value ? `?${value}` : '';
}

export function statementPath(request: StatementRequest): string {
  return `/reports/statements/${request.subject.kind}/${encodeURIComponent(request.subject.id)}`
    + queryForPeriod(request.period);
}

export function statementExportPath(
  request: StatementRequest,
  format: ReportFormat,
): string {
  return `/reports/statements/${request.subject.kind}/${encodeURIComponent(request.subject.id)}/export`
    + queryForPeriod(request.period, format);
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T | { error?: string };
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body
      ? String(body.error)
      : `report API returned ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

/** Browser client for statement, export, schedule, and dead-letter administration. */
export class ReportsApi {
  constructor(
    private readonly baseUrl = import.meta.env.VITE_INDEXER_URL ?? '',
    private readonly request: ReportsFetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  async statement(input: StatementRequest): Promise<Statement> {
    return responseJson<Statement>(await this.request(endpoint(this.baseUrl, statementPath(input))));
  }

  async reconciledStatement(
    input: StatementRequest,
    reconciliation: ReconciliationRequest,
  ): Promise<Statement> {
    return responseJson<Statement>(await this.request(
      endpoint(this.baseUrl, statementPath(input)),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(reconciliation),
      },
    ));
  }

  exportUrl(input: StatementRequest, format: ReportFormat): string {
    return endpoint(this.baseUrl, statementExportPath(input, format));
  }

  async schedules(): Promise<ReportSchedule[]> {
    return responseJson<ReportSchedule[]>(await this.request(endpoint(this.baseUrl, '/reports/schedules')));
  }

  async createSchedule(input: ReportScheduleInput): Promise<ReportSchedule> {
    return responseJson<ReportSchedule>(await this.request(
      endpoint(this.baseUrl, '/reports/schedules'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
    ));
  }

  async deliveries(status?: DeliveryStatus): Promise<ReportDelivery[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return responseJson<ReportDelivery[]>(await this.request(
      endpoint(this.baseUrl, `/reports/deliveries${query}`),
    ));
  }

  async replay(deliveryId: string): Promise<ReportDelivery> {
    return responseJson<ReportDelivery>(await this.request(
      endpoint(this.baseUrl, `/reports/deliveries/${encodeURIComponent(deliveryId)}/replay`),
      { method: 'POST' },
    ));
  }
}
