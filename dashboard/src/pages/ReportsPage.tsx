import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  RefreshCw,
  RotateCcw,
  Send,
} from 'lucide-react';
import { AddressChip, Badge, Card, EmptyState, SectionHeader } from '../components/ui/index.js';
import { useAgentsPanel } from '../lib/chain/panels.js';
import {
  ReportsApi,
  type DeliveryStatus,
  type ReportCadence,
  type ReportDelivery,
  type ReportFormat,
  type ReportSchedule,
  type ReportSubjectKind,
  type BalancePosition,
  type Statement,
  type StatementCategoryTotal,
  type StatementLine,
  type StatementRequest,
} from '../lib/reportsApi.js';

const api = new ReportsApi();
const inputClass = 'w-full bg-sa-bg border border-sa-border rounded-lg px-3 py-2 text-sm text-sa-text '
  + 'focus:outline-none focus:border-sa-accent disabled:opacity-50';
const labelClass = 'label block mb-1.5';

function requestFromFields(
  kind: ReportSubjectKind,
  id: string,
  fromLedger: string,
  throughLedger: string,
): StatementRequest {
  const period = {
    ...(fromLedger ? { fromLedger: Number(fromLedger) } : {}),
    ...(throughLedger ? { throughLedger: Number(throughLedger) } : {}),
  };
  if (!id.trim()) throw new Error('Agent or owner account is required');
  if (fromLedger && (!Number.isSafeInteger(period.fromLedger) || period.fromLedger! < 0)) {
    throw new Error('Opening ledger must be a non-negative integer');
  }
  if (throughLedger && (!Number.isSafeInteger(period.throughLedger) || period.throughLedger! < 0)) {
    throw new Error('Closing ledger must be a non-negative integer');
  }
  if (
    period.fromLedger !== undefined
    && period.throughLedger !== undefined
    && period.fromLedger > period.throughLedger
  ) {
    throw new Error('Opening ledger must not exceed closing ledger');
  }
  return { subject: { kind, id: id.trim() }, period };
}

function displayDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function defaultNextRun(): string {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  value.setMinutes(0, 0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function parsePositions(value: string, label: string): BalancePosition[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
  for (const item of parsed) {
    if (
      typeof item !== 'object' || item === null
      || typeof (item as BalancePosition).account !== 'string'
      || typeof (item as BalancePosition).asset !== 'string'
      || typeof (item as BalancePosition).amount !== 'string'
    ) {
      throw new Error(`${label} rows require string account, asset, and amount fields`);
    }
  }
  return parsed as BalancePosition[];
}

function statusBadge(status: DeliveryStatus) {
  if (status === 'delivered') return <Badge variant="success">Delivered</Badge>;
  if (status === 'dead_letter') return <Badge variant="danger">Dead letter</Badge>;
  if (status === 'retry') return <Badge variant="warning">Retry</Badge>;
  if (status === 'delivering') return <Badge variant="info">Delivering</Badge>;
  return <Badge>Pending</Badge>;
}

function DirectionAmount({ line }: { line: StatementLine }) {
  const prefix = line.direction === 'credit' ? '+' : line.direction === 'debit' ? '−' : '';
  const color = line.direction === 'credit'
    ? 'text-sa-green'
    : line.direction === 'debit' ? 'text-sa-text' : 'text-sa-text-dim';
  return <span className={`font-mono ${color}`}>{prefix}{line.amount} {line.asset}</span>;
}

function CategoryTable({ rows }: { rows: StatementCategoryTotal[] }) {
  if (!rows.length) return <EmptyState message="No categories in this statement" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-sa-border">
            {['Category', 'Asset', 'Transactions', 'Credits', 'Debits', 'Net'].map((heading) => (
              <th key={heading} className="label text-left py-2.5 px-3 first:pl-0">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.dimension}:${row.key}:${row.asset}`} className="border-b border-sa-border/50">
              <td className="py-3 px-3 first:pl-0 text-sa-text">{row.key}</td>
              <td className="py-3 px-3 font-mono text-xs">{row.asset}</td>
              <td className="py-3 px-3 font-mono">{row.count}</td>
              <td className="py-3 px-3 font-mono text-sa-green">{row.credits}</td>
              <td className="py-3 px-3 font-mono">{row.debits}</td>
              <td className="py-3 px-3 font-mono text-sa-accent">{row.net}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvidencePanel({ line, onClose }: { line: StatementLine; onClose(): void }) {
  const explorerNetwork = import.meta.env.VITE_STELLAR_EXPERT_NETWORK ?? 'testnet';
  return (
    <Card className="border-sa-accent/30">
      <SectionHeader
        title="Transaction evidence"
        subtitle="Independent references for the selected statement line"
        action={<button type="button" className="text-xs text-sa-text-dim hover:text-sa-text" onClick={onClose}>Close</button>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div><p className="label mb-1">Line ID</p><p className="font-mono text-xs break-all">{line.lineId}</p></div>
        <div><p className="label mb-1">Ledger</p><p className="font-mono">#{line.ledger}</p></div>
        <div><p className="label mb-1">Reference</p><p className="font-mono text-xs break-all">{line.referenceType}:{line.referenceId}</p></div>
        <div><p className="label mb-1">Running balance</p><p className="font-mono">{line.runningBalance} {line.asset}</p></div>
      </div>
      <div className="mt-4 pt-4 border-t border-sa-border">
        <p className="label mb-1">Transaction hash</p>
        <a
          href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${line.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-sa-accent hover:underline break-all inline-flex items-center gap-1"
        >
          {line.txHash}<ArrowUpRight size={12} className="shrink-0" />
        </a>
      </div>
    </Card>
  );
}

export function ReportsPage() {
  const agentsPanel = useAgentsPanel();
  const [subjectKind, setSubjectKind] = useState<ReportSubjectKind>('agent');
  // Prefilled from the first watched agent so a statement is one click away,
  // but always the real roster's address — a default that silently points at
  // a fixture account is how a report gets filed against the wrong subject.
  const [subjectId, setSubjectId] = useState('');
  const [fromLedger, setFromLedger] = useState('');
  const [throughLedger, setThroughLedger] = useState('');
  const [format, setFormat] = useState<ReportFormat>('csv');
  const [attachReconciliation, setAttachReconciliation] = useState(false);
  const [openingSnapshot, setOpeningSnapshot] = useState('[]');
  const [closingSnapshot, setClosingSnapshot] = useState('[]');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [selectedLine, setSelectedLine] = useState<StatementLine | null>(null);
  const [categoryDimension, setCategoryDimension] = useState<StatementCategoryTotal['dimension']>('payment_type');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scheduleId, setScheduleId] = useState('');
  const [cadence, setCadence] = useState<ReportCadence>('monthly');
  const [nextRunAt, setNextRunAt] = useState(defaultNextRun);
  const [destinationKind, setDestinationKind] = useState<'webhook' | 'email'>('webhook');
  const [destinationValue, setDestinationValue] = useState('');
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [deliveries, setDeliveries] = useState<ReportDelivery[]>([]);
  const [scheduleBusy, setScheduleBusy] = useState(false);

  // Adopt the first agent the chain knows about, once, when the roster lands.
  // A `useEffect` rather than derived state: the operator may have cleared or
  // typed the field already, and a prefilled value must never overwrite that.
  const firstAgent = agentsPanel.data?.[0]?.address;
  useEffect(() => {
    setSubjectId((current) => (current ? current : (firstAgent ?? '')));
  }, [firstAgent]);

  const currentRequest = useMemo(() => {
    try {
      return requestFromFields(subjectKind, subjectId, fromLedger, throughLedger);
    } catch {
      return null;
    }
  }, [fromLedger, subjectId, subjectKind, throughLedger]);
  const exportUrl = currentRequest ? api.exportUrl(currentRequest, format) : '#';
  const categories = statement?.categories.filter((row) => row.dimension === categoryDimension) ?? [];

  async function buildPreview(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSelectedLine(null);
    try {
      const input = requestFromFields(subjectKind, subjectId, fromLedger, throughLedger);
      if (attachReconciliation) {
        if (input.period.throughLedger === undefined) {
          throw new Error('A closing ledger is required for reconciliation');
        }
        setStatement(await api.reconciledStatement(input, {
          ...(input.period.fromLedger === undefined
            ? {} : { fromLedger: input.period.fromLedger }),
          asOfLedger: input.period.throughLedger,
          openingPositions: parsePositions(openingSnapshot, 'Opening snapshot'),
          onChainPositions: parsePositions(closingSnapshot, 'Closing snapshot'),
        }));
      } else {
        setStatement(await api.statement(input));
      }
    } catch (caught) {
      setStatement(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function loadSchedules(): Promise<void> {
    setScheduleBusy(true);
    setError(null);
    try {
      const [saved, recent] = await Promise.all([api.schedules(), api.deliveries()]);
      setSchedules(saved);
      setDeliveries(recent);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function createSchedule(event: FormEvent): Promise<void> {
    event.preventDefault();
    setScheduleBusy(true);
    try {
      const subject = requestFromFields(subjectKind, subjectId, '', '').subject;
      if (!destinationValue.trim()) throw new Error('Webhook URL or email recipient is required');
      const id = scheduleId.trim()
        || `${cadence}-${subject.kind}-${subject.id.slice(0, 12).toLowerCase()}`;
      await api.createSchedule({
        scheduleId: id,
        subject,
        cadence,
        format,
        destinations: destinationKind === 'webhook'
          ? [{ id: 'primary-webhook', kind: 'webhook', url: destinationValue.trim() }]
          : [{ id: 'primary-email', kind: 'email', to: [destinationValue.trim()] }],
        nextRunAt: new Date(nextRunAt).toISOString(),
      });
      setScheduleId(id);
      await loadSchedules();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setScheduleBusy(false);
    }
  }

  async function replay(deliveryId: string): Promise<void> {
    setScheduleBusy(true);
    setError(null);
    try {
      await api.replay(deliveryId);
      await loadSchedules();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setScheduleBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b border-sa-border px-8 py-5 bg-sa-bg/50 backdrop-blur sticky top-0 z-10">
        <h1 className="font-display text-xl font-semibold text-sa-text">Reports</h1>
        <p className="text-xs text-sa-text-dim mt-0.5">Reconciled statements, verifiable exports, and durable delivery</p>
      </div>

      <div className="p-8 space-y-6">
        {error && (
          <div role="alert" className="border border-sa-red/40 bg-sa-red/10 text-sa-red rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <Card>
          <SectionHeader title="Build a statement" subtitle="Choose an attributable account and inclusive ledger period" />
          <form onSubmit={(event) => void buildPreview(event)} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 items-end">
            <label>
              <span className={labelClass}>Statement for</span>
              <select className={inputClass} value={subjectKind} onChange={(event) => setSubjectKind(event.target.value as ReportSubjectKind)}>
                <option value="agent">Agent</option><option value="owner">Owner</option>
              </select>
            </label>
            <label className="xl:col-span-2">
              <span className={labelClass}>Account</span>
              <input className={inputClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)} aria-label="Report account" />
            </label>
            <label>
              <span className={labelClass}>Opening ledger</span>
              <input className={inputClass} type="number" min="0" value={fromLedger} onChange={(event) => setFromLedger(event.target.value)} placeholder="Any" />
            </label>
            <label>
              <span className={labelClass}>Closing ledger</span>
              <input className={inputClass} type="number" min="0" value={throughLedger} onChange={(event) => setThroughLedger(event.target.value)} placeholder="Latest" />
            </label>
            <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={busy}>
              {busy ? <RefreshCw size={15} className="animate-spin" /> : <FileSearch size={15} />}
              {busy ? 'Building…' : 'Build preview'}
            </button>
            <label className="xl:col-span-6 flex items-center gap-2 text-sm text-sa-text-dim cursor-pointer">
              <input
                type="checkbox"
                className="accent-sa-accent"
                checked={attachReconciliation}
                onChange={(event) => setAttachReconciliation(event.target.checked)}
              />
              Attach opening and closing on-chain balance checkpoints
            </label>
            {attachReconciliation && (
              <>
                <label className="xl:col-span-3">
                  <span className={labelClass}>Opening snapshot JSON</span>
                  <textarea
                    className={`${inputClass} font-mono text-xs min-h-24`}
                    value={openingSnapshot}
                    onChange={(event) => setOpeningSnapshot(event.target.value)}
                    placeholder='[{"account":"C…","asset":"C…","amount":"0"}]'
                  />
                </label>
                <label className="xl:col-span-3">
                  <span className={labelClass}>Closing snapshot JSON</span>
                  <textarea
                    className={`${inputClass} font-mono text-xs min-h-24`}
                    value={closingSnapshot}
                    onChange={(event) => setClosingSnapshot(event.target.value)}
                    placeholder='[{"account":"C…","asset":"C…","amount":"100"}]'
                  />
                </label>
                <p className="xl:col-span-6 text-xs text-sa-text-dim">
                  Snapshot balances at the exact opening and closing ledger boundaries. Amounts are integer asset units.
                </p>
              </>
            )}
          </form>
        </Card>

        {statement ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card><p className="label mb-2">Statement</p><p className="font-mono text-xs text-sa-accent break-all">{statement.statementId}</p></Card>
              <Card><p className="label mb-2">Entries</p><p className="font-display text-2xl font-semibold">{statement.evidence.entryCount}</p></Card>
              <Card><p className="label mb-2">Transactions</p><p className="font-display text-2xl font-semibold">{statement.evidence.transactionCount}</p></Card>
              <Card>
                <p className="label mb-2">Reconciliation</p>
                {statement.reconciliation
                  ? statement.reconciliation.reconciled
                    ? <Badge variant="success"><CheckCircle2 size={12} /> Exact</Badge>
                    : <Badge variant="danger">Discrepancy</Badge>
                  : <Badge variant="neutral">Not attached</Badge>}
              </Card>
            </div>

            <Card>
              <SectionHeader
                title="Opening and closing positions"
                subtitle="Credits and debits are reported in each asset's smallest unit"
                action={(
                  <div className="flex items-center gap-2">
                    <select className={`${inputClass} py-1.5`} aria-label="Export format" value={format} onChange={(event) => setFormat(event.target.value as ReportFormat)}>
                      <option value="csv">CSV</option><option value="json">JSON lines</option><option value="iif">IIF accounting</option>
                    </select>
                    <a className="btn-secondary flex items-center gap-2 whitespace-nowrap" href={exportUrl} download>
                      <ArrowDownToLine size={14} /> Export
                    </a>
                  </div>
                )}
              />
              {statement.positions.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {statement.positions.map((position) => (
                    <div key={position.asset} className="bg-sa-bg/50 border border-sa-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3"><p className="font-mono text-sa-accent">{position.asset}</p><Badge>{position.openingAmount} opening</Badge></div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div><p className="label mb-1">Credits</p><p className="font-mono text-sa-green">{position.credits}</p></div>
                        <div><p className="label mb-1">Debits</p><p className="font-mono">{position.debits}</p></div>
                        <div><p className="label mb-1">Closing</p><p className="font-mono text-sa-accent">{position.closingAmount}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState message="No balances in this period" />}
            </Card>

            {statement.reconciliation && (
              <Card>
                <SectionHeader
                  title="Reconciliation detail"
                  subtitle={`Indexed activity from ledger ${statement.reconciliation.fromLedger} through ${statement.reconciliation.asOfLedger}`}
                />
                {statement.reconciliation.lines.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-sa-border">
                        {['Status', 'Account', 'Asset', 'Expected', 'On chain', 'Difference'].map((heading) => <th key={heading} className="label text-left py-2.5 px-3 first:pl-0">{heading}</th>)}
                      </tr></thead>
                      <tbody>{statement.reconciliation.lines.map((line) => (
                        <tr key={`${line.account}:${line.asset}`} className="border-b border-sa-border/50">
                          <td className="py-3 px-3 first:pl-0"><Badge variant={line.status === 'matched' ? 'success' : 'danger'}>{line.status.replace(/_/g, ' ')}</Badge></td>
                          <td className="py-3 px-3"><AddressChip address={line.account} /></td>
                          <td className="py-3 px-3 font-mono text-xs">{line.asset}</td>
                          <td className="py-3 px-3 font-mono">{line.expectedAmount}</td>
                          <td className="py-3 px-3 font-mono">{line.onChainAmount ?? 'missing'}</td>
                          <td className="py-3 px-3 font-mono text-sa-red">{line.difference ?? '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <EmptyState message="No account and asset positions were selected" />}
              </Card>
            )}

            <Card>
              <SectionHeader
                title="Statement lines"
                subtitle="Select a line to inspect its ledger and transaction proof"
              />
              {statement.lines.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-sa-border">
                      {['Ledger', 'Type', 'Counterparty', 'Amount', 'Balance', 'Proof'].map((heading) => (
                        <th key={heading} className="label text-left py-2.5 px-3 first:pl-0">{heading}</th>
                      ))}
                    </tr></thead>
                    <tbody>{statement.lines.map((line) => (
                      <tr
                        key={line.lineId}
                        className="border-b border-sa-border/50 hover:bg-sa-bg/50 cursor-pointer"
                        onClick={() => setSelectedLine(line)}
                      >
                        <td className="py-3 px-3 first:pl-0 font-mono text-xs">#{line.ledger}</td>
                        <td className="py-3 px-3"><Badge variant="info">{line.category}</Badge></td>
                        <td className="py-3 px-3">{line.counterparty ? <AddressChip address={line.counterparty} /> : <span className="text-sa-muted">—</span>}</td>
                        <td className="py-3 px-3"><DirectionAmount line={line} /></td>
                        <td className="py-3 px-3 font-mono text-xs">{line.runningBalance}</td>
                        <td className="py-3 px-3"><button type="button" className="text-sa-accent flex items-center gap-1" onClick={() => setSelectedLine(line)}>Verify <ChevronRight size={13} /></button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <EmptyState message="No attributable transactions in this period" />}
            </Card>

            {selectedLine && <EvidencePanel line={selectedLine} onClose={() => setSelectedLine(null)} />}

            <Card>
              <SectionHeader
                title="Categorized activity"
                subtitle="Totals retain their source asset rather than combining unlike units"
                action={(
                  <select className={`${inputClass} py-1.5`} aria-label="Category dimension" value={categoryDimension} onChange={(event) => setCategoryDimension(event.target.value as StatementCategoryTotal['dimension'])}>
                    <option value="payment_type">Payment type</option><option value="counterparty">Counterparty</option><option value="asset">Asset</option>
                  </select>
                )}
              />
              <CategoryTable rows={categories} />
            </Card>
          </>
        ) : (
          <Card><EmptyState message="Build a statement to preview balances, activity, and transaction evidence" /></Card>
        )}

        <Card>
          <SectionHeader title="Scheduled delivery" subtitle="Generate closed-period exports with idempotent webhook or email delivery" />
          <form onSubmit={(event) => void createSchedule(event)} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 items-end">
            <label><span className={labelClass}>Schedule ID</span><input className={inputClass} value={scheduleId} onChange={(event) => setScheduleId(event.target.value)} placeholder="Generated if blank" /></label>
            <label><span className={labelClass}>Cadence</span><select className={inputClass} value={cadence} onChange={(event) => setCadence(event.target.value as ReportCadence)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></label>
            <label><span className={labelClass}>First run</span><input className={inputClass} type="datetime-local" required value={nextRunAt} onChange={(event) => setNextRunAt(event.target.value)} /></label>
            <label><span className={labelClass}>Destination</span><select className={inputClass} value={destinationKind} onChange={(event) => setDestinationKind(event.target.value as 'webhook' | 'email')}><option value="webhook">Webhook</option><option value="email">Email</option></select></label>
            <label><span className={labelClass}>{destinationKind === 'webhook' ? 'Webhook URL' : 'Recipient email'}</span><input className={inputClass} type={destinationKind === 'webhook' ? 'url' : 'email'} required value={destinationValue} onChange={(event) => setDestinationValue(event.target.value)} placeholder={destinationKind === 'webhook' ? 'https://…' : 'finance@…'} /></label>
            <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={scheduleBusy}><CalendarClock size={15} /> Save schedule</button>
          </form>
        </Card>

        <Card>
          <SectionHeader
            title="Delivery operations"
            subtitle="Saved schedules and retry/dead-letter state"
            action={<button type="button" className="btn-secondary flex items-center gap-2" disabled={scheduleBusy} onClick={() => void loadSchedules()}><RefreshCw size={14} className={scheduleBusy ? 'animate-spin' : ''} /> Refresh</button>}
          />
          {!schedules.length && !deliveries.length ? <EmptyState message="Refresh to load schedules and deliveries" /> : (
            <div className="space-y-5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm"><thead><tr className="border-b border-sa-border">{['Schedule', 'Subject', 'Cadence', 'Format', 'Next run', 'Destination'].map((heading) => <th key={heading} className="label text-left py-2.5 px-3 first:pl-0">{heading}</th>)}</tr></thead>
                  <tbody>{schedules.map((schedule) => <tr key={schedule.scheduleId} className="border-b border-sa-border/50"><td className="py-3 px-3 first:pl-0 font-mono text-xs">{schedule.scheduleId}</td><td className="py-3 px-3"><span className="text-xs capitalize">{schedule.subject.kind}</span> <AddressChip address={schedule.subject.id} /></td><td className="py-3 px-3 capitalize">{schedule.cadence}</td><td className="py-3 px-3 uppercase font-mono">{schedule.format}</td><td className="py-3 px-3 text-xs text-sa-text-dim">{displayDate(schedule.nextRunAt)}</td><td className="py-3 px-3">{schedule.destinations.map((destination) => destination.kind).join(', ')}</td></tr>)}</tbody>
                </table>
              </div>
              {!!deliveries.length && (
                <div className="overflow-x-auto pt-4 border-t border-sa-border">
                  <div className="flex items-center gap-2 mb-3"><Send size={14} className="text-sa-accent" /><p className="label">Delivery attempts</p></div>
                  <table className="w-full text-sm"><thead><tr className="border-b border-sa-border">{['Delivery', 'Schedule', 'Status', 'Attempts', 'Next attempt', 'Action'].map((heading) => <th key={heading} className="label text-left py-2.5 px-3 first:pl-0">{heading}</th>)}</tr></thead>
                    <tbody>{deliveries.map((delivery) => <tr key={delivery.deliveryId} className="border-b border-sa-border/50"><td className="py-3 px-3 first:pl-0 font-mono text-xs">{delivery.deliveryId}</td><td className="py-3 px-3 font-mono text-xs">{delivery.scheduleId}</td><td className="py-3 px-3">{statusBadge(delivery.status)}</td><td className="py-3 px-3 font-mono">{delivery.attemptCount}</td><td className="py-3 px-3 text-xs text-sa-text-dim">{displayDate(delivery.nextAttemptAt)}</td><td className="py-3 px-3">{delivery.status === 'dead_letter' ? <button type="button" className="text-sa-accent hover:underline flex items-center gap-1" onClick={() => void replay(delivery.deliveryId)}><RotateCcw size={12} /> Replay</button> : <span className="text-sa-muted">—</span>}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
