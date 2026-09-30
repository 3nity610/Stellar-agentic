import { useMemo, useState } from 'react';
import { AlertTriangle, Clock, Gauge, ShieldCheck, ShieldOff } from 'lucide-react';
import { useRateLimitStatus } from '@stellaragent/react';
import { Badge, Card, ProgressBar, SectionHeader } from '../components/ui/index.js';
import { MOCK_AGENTS } from '../lib/mockData.js';
import { hasContractConfiguration } from '../lib/agentRuntime.js';
import {
  buildRateLimitRows,
  buildWindowRows,
  describeBlockReasons,
  type RateLimitRow,
  type WindowRow,
} from '../lib/rateLimitView.js';

const DEFAULT_AGENT = MOCK_AGENTS[0];

function LimitCard({ row }: { row: RateLimitRow }) {
  return (
    // A labelled region so each ceiling is addressable on its own — by a
    // screen reader and by the e2e spec — instead of only by its text.
    <section aria-label={row.label}>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="font-display text-sm font-semibold text-sa-text">{row.label}</p>
            <p className="text-xs text-sa-text-dim mt-0.5">{row.detail}</p>
          </div>
          {row.exhausted && <Badge variant="danger">Exhausted</Badge>}
          {!row.exhausted && row.unset && <Badge variant="neutral">No ceiling</Badge>}
        </div>
        <p className="font-display text-xl font-semibold text-sa-text mb-1">
          {row.spent}
          <span className="text-sa-text-dim text-sm font-normal"> / {row.limit}</span>
        </p>
        <ProgressBar value={row.usedPercent} showPercent />
        <p className="text-xs text-sa-text-dim mt-2 font-mono">
          {row.unset ? 'No cap on this limit' : `Headroom ${row.headroom}`}
        </p>
      </Card>
    </section>
  );
}

function WindowCard({ row }: { row: WindowRow }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Clock size={14} className="text-sa-accent shrink-0" />
      <span className="text-sm text-sa-text w-32">{row.label}</span>
      <span className="text-sm text-sa-text-dim font-mono ml-auto">~{row.resetsIn}</span>
      <span className="text-xs text-sa-text-dim font-mono w-40 text-right">
        {row.ledgersRemaining} ledgers
      </span>
    </div>
  );
}

function UnconfiguredNotice({ agentName }: { agentName: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-2">
        <ShieldOff size={16} className="text-sa-yellow" />
        <p className="font-display text-sm font-semibold text-sa-text">
          No rate limits configured for {agentName}
        </p>
      </div>
      <p className="text-sm text-sa-text-dim">
        <code className="text-sa-accent">RateLimiter.set_limits</code> has never been called for
        this agent, so the rate limiter imposes no cap: every limit below is
        unset rather than zero, and{' '}
        <code className="text-sa-accent">RateLimiter.check</code> returns{' '}
        <code className="text-sa-accent">true</code> for any amount. A configured payment
        channel&rsquo;s own spend limit still applies.
      </p>
      <p className="text-xs text-sa-text-dim mt-3">
        To bound this agent, call <code className="text-sa-accent">set_limits</code> with a
        per-transaction, hourly, daily, and hourly transaction-count ceiling.
      </p>
    </Card>
  );
}

export function LimitsPage() {
  const [agentAddress, setAgentAddress] = useState(DEFAULT_AGENT.address);
  const [probe, setProbe] = useState('1');
  const { status, data, error } = useRateLimitStatus(agentAddress, { intervalMs: 10_000 });

  const agentName = MOCK_AGENTS.find((a) => a.address === agentAddress)?.name ?? agentAddress;
  const rows = useMemo(() => (data ? buildRateLimitRows(data.rateLimit) : []), [data]);
  const windows = useMemo(
    () =>
      data
        ? buildWindowRows({ hour: data.hourWindow, day: data.dayWindow })
        : [],
    [data],
  );
  const prediction = useMemo(
    () => (data ? data.predict(probe || '0') : null),
    [data, probe],
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sa-text">Rate Limits</h1>
          <p className="text-sa-text-dim text-sm mt-1">
            On-chain ceilings from <code className="text-sa-accent">RateLimiter</code> and the
            payment channel&rsquo;s own spend limit
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-sa-text-dim">
          Agent
          <select
            aria-label="Agent"
            className="bg-sa-bg border border-sa-border rounded-lg px-3 py-1.5 text-sm text-sa-text"
            value={agentAddress}
            onChange={(event) => setAgentAddress(event.target.value)}
          >
            {MOCK_AGENTS.map((agent) => (
              <option key={agent.address} value={agent.address}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {!hasContractConfiguration() && (
        <Card className="p-4 border-sa-yellow/40">
          <p className="text-sm text-sa-text-dim">
            <AlertTriangle size={14} className="inline mr-1 text-sa-yellow" />
            No contract addresses are configured, so there is nothing to query. Set{' '}
            <code className="text-sa-accent">VITE_CONTRACT_RATE_LIMITER</code> and{' '}
            <code className="text-sa-accent">VITE_CONTRACT_PAYMENT_CHANNEL</code> before building
            the dashboard to see live limits.
          </p>
        </Card>
      )}

      {status === 'error' && (
        <Card className="p-4 border-sa-red/40">
          <p className="text-sm text-sa-red">
            Could not read rate limits: {error?.message ?? 'unknown error'}
          </p>
        </Card>
      )}

      {(status === 'idle' || status === 'loading') && !data && (
        <Card className="p-5">
          <p className="text-sm text-sa-text-dim">
            {status === 'idle' ? 'Connecting to the network…' : 'Reading on-chain limits…'}
          </p>
        </Card>
      )}

      {data && !data.rateLimitConfigured && <UnconfiguredNotice agentName={agentName} />}

      {data?.rateLimitConfigured && (
        <>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-sa-green" />
            <p className="text-sm text-sa-text">
              Rate limits active for {agentName}
            </p>
            {data.rateLimitKilled && (
              <Badge variant="warning">Killed — check no longer consults the active flag</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {rows.map((row) => (
              <LimitCard key={row.key} row={row} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <SectionHeader
                title="Window resets"
                subtitle="Estimated from observed ledger close times, not a countdown"
              />
              <div className="divide-y divide-sa-border">
                {windows.map((row) => (
                  <WindowCard key={row.key} row={row} />
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <SectionHeader
                title="Would this payment go through?"
                subtitle="Predicted locally — no network round trip, no fee"
              />
              <div className="flex items-center gap-3">
                <Gauge size={16} className="text-sa-accent" />
                <label className="text-sm text-sa-text-dim" htmlFor="probe-amount">
                  Amount
                </label>
                <input
                  id="probe-amount"
                  aria-label="Test amount"
                  className="bg-sa-bg border border-sa-border rounded-lg px-3 py-1.5 text-sm text-sa-text font-mono w-40"
                  value={probe}
                  onChange={(event) => setProbe(event.target.value)}
                />
                {prediction && (
                  prediction.wouldBlock ? (
                    <Badge variant="danger">Blocked</Badge>
                  ) : (
                    <Badge variant="success">Allowed</Badge>
                  )
                )}
              </div>
              {prediction?.wouldBlock && (
                <ul className="mt-3 space-y-1">
                  {describeBlockReasons(prediction.reasons).map((reason) => (
                    <li key={reason} className="text-sm text-sa-red">
                      · {reason}
                    </li>
                  ))}
                </ul>
              )}
              {prediction && !prediction.wouldBlock && (
                <p className="text-sm text-sa-text-dim mt-3">
                  Clears every per-transaction, hourly, and daily ceiling.
                </p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
