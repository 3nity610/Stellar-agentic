import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Bot, Zap, DollarSign, Activity, AlertTriangle } from 'lucide-react';

import {
  StatCard,
  Card,
  Badge,
  StatusDot,
  AddressChip,
  SectionHeader,
  ProgressBar,
} from '../components/ui/index.js';
import { PanelBoundary } from '../components/dashboard/PanelBoundary.js';
import { useAgentsPanel, usePaymentsPanel } from '../lib/chain/panels.js';
import { useDashboard } from '../lib/chain/DashboardProvider.js';
import { sumAmounts, fmt, pctNumber } from '../lib/deterministic-math.js';
import type { Agent } from '../lib/chain/types.js';

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  value?: number | string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: ReactNode;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card p-3 text-xs shadow-xl">
      <p className="label mb-2">{label}</p>
      <p className="text-sa-accent font-mono">
        ${typeof payload[0]?.value === 'number' ? payload[0].value.toFixed(3) : payload[0]?.value}{' '}
        spent
      </p>
      <p className="text-sa-text-dim font-mono">{payload[1]?.value} ops</p>
    </div>
  );
}

// ─── Overview Page ────────────────────────────────────────────────────────────

export function OverviewPage() {
  const agentsPanel = useAgentsPanel();
  const paymentsPanel = usePaymentsPanel();
  const { config } = useDashboard();

  const agents: Agent[] = agentsPanel.data ?? [];
  const payments = paymentsPanel.data ?? [];
  const series = paymentsPanel.series;

  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const warningAgents = agents.filter((a) => a.status === 'warning').length;
  // Deterministic sum: use bignumber.js so the result is identical on ARM and x86
  const totalSpentToday = fmt(sumAmounts(agents.map((a) => a.spentToday)), 2);
  const totalOps = agents.reduce((sum, a) => sum + a.totalOps, 0).toLocaleString();
  // The chain has no "operation count" for a period; the payment feed's row
  // count is the closest real thing, and it is labelled as what it is.
  const paymentCount = payments.length;
  const totalOpsKnown = agents.length > 0;

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="border-b border-sa-border px-8 py-5 flex items-center justify-between bg-sa-bg/50 backdrop-blur sticky top-0 z-10">
        <div>
          <h1 className="font-display text-xl font-semibold text-sa-text">Overview</h1>
          <p className="text-xs text-sa-text-dim mt-0.5">
            AI Agent Payment Dashboard · Stellar Testnet
          </p>
        </div>
        <div className="flex items-center gap-3">
          {warningAgents > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 bg-sa-yellow/10 border border-sa-yellow/30 rounded-lg px-3 py-1.5"
            >
              <AlertTriangle size={13} className="text-sa-yellow" />
              <span className="text-xs text-sa-yellow font-medium">
                {warningAgents} agent{warningAgents > 1 ? 's' : ''} near limit
              </span>
            </motion.div>
          )}
          <button className="btn-primary flex items-center gap-2 text-sm">
            <Bot size={14} />
            New Agent
          </button>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Active Agents"
            value={totalOpsKnown ? `${activeAgents} / ${agents.length}` : '—'}
            sub={warningAgents > 0 ? `${warningAgents} near limit` : 'All healthy'}
            icon={<Bot size={20} />}
            accent
          />
          <StatCard
            label="Spent Today"
            value={totalOpsKnown ? `$${totalSpentToday}` : '—'}
            sub="Across all watched agents"
            trend="up"
            trendValue="↑ 12% vs yesterday"
            icon={<DollarSign size={20} />}
          />
          <StatCard
            label="Payments (24h)"
            value={paymentsPanel.status === 'ready' ? String(paymentCount) : '—'}
            sub={totalOpsKnown ? `${totalOps} tx this hour across agents` : 'Awaiting chain data'}
            icon={<Zap size={20} />}
          />
          <StatCard
            label="Network"
            value={config.mode === 'mock' ? 'Demo data' : config.network}
            sub={config.mode === 'mock' ? 'fixtures, not the chain' : '2.5s finality · ~$0 fees'}
            icon={<Activity size={20} />}
          />
        </div>

        {/* Spend Chart */}
        <Card>
          <SectionHeader
            title="Spend over 24h"
            subtitle="All agents combined · bucketed from indexed payments"
          />
          <div className="h-52" aria-busy={paymentsPanel.status === 'loading'}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="opsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00FFB2" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#00FFB2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,37,53,0.8)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#7A90A8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#7A90A8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="spend"
                  stroke="#00D4FF"
                  strokeWidth={2}
                  fill="url(#spendGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="ops"
                  stroke="#00FFB2"
                  strokeWidth={1.5}
                  fill="url(#opsGrad)"
                  strokeDasharray="4 2"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-6 mt-3">
            <div className="flex items-center gap-2 text-xs text-sa-text-dim">
              <span className="w-6 h-0.5 bg-sa-accent inline-block rounded" />
              USDC Spend
            </div>
            <div className="flex items-center gap-2 text-xs text-sa-text-dim">
              <span className="w-6 border-t border-dashed border-sa-green inline-block" />
              Operations
            </div>
          </div>
        </Card>

        {/* Bottom row: Agents + Recent Payments */}
        <div className="grid grid-cols-2 gap-6">
          {/* Agents */}
          <Card>
            <SectionHeader
              title="Agents"
              action={
                <button className="btn-secondary text-xs py-1.5 px-3">View all</button>
              }
            />
            <PanelBoundary
              panel={agentsPanel}
              label="Agents"
              emptyMessage="No agents in the roster yet. Add one to VITE_STELLARAGENT_AGENTS."
              failures={agentsPanel.failures}
            >
              {(rows) => (
                <div className="space-y-3">
                  {rows.map((agent, i) => (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-sa-bg/60 transition-colors cursor-pointer"
                    >
                      <StatusDot status={agent.status} pulse={agent.status === 'active'} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-sa-text truncate">{agent.name}</p>
                          {agent.status === 'warning' && (
                            <Badge variant="warning">Near limit</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <AddressChip address={agent.address} />
                          <span className="text-xs text-sa-text-dim">{agent.lastActive}</span>
                        </div>
                        <div className="mt-2">
                          <ProgressBar
                            value={pctNumber(agent.spentToday, agent.limitPerDay)}
                            max={100}
                            showPercent
                            danger={agent.status === 'warning'}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono text-sa-text">
                          ${agent.balance}
                        </p>
                        <p className="text-[10px] text-sa-text-dim">{agent.asset}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </PanelBoundary>
          </Card>

          {/* Recent Payments */}
          <Card>
            <SectionHeader
              title="Recent Payments"
              subtitle={config.indexerUrl ? 'Live feed' : 'No indexer configured'}
              action={
                <div className="flex items-center gap-2">
                  <StatusDot status="active" pulse={paymentsPanel.status === 'ready'} />
                  <span className="text-xs text-sa-text-dim">
                    {paymentsPanel.status === 'ready' ? 'Live' : 'Connecting'}
                  </span>
                </div>
              }
            />
            <PanelBoundary
              panel={paymentsPanel}
              label="Payments"
              emptyMessage={
                config.indexerUrl
                  ? 'No channel payments have been indexed yet.'
                  : 'Set VITE_STELLARAGENT_INDEXER_URL to show the payment feed.'
              }
            >
              {(rows) => (
                <div className="space-y-2">
                  {rows.slice(0, 5).map((payment, i) => (
                    <motion.div
                      key={payment.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-sa-bg/60 transition-colors"
                    >
                      <div
                        className={`w-1.5 h-8 rounded-full shrink-0 ${
                          payment.status === 'success'
                            ? 'bg-sa-green'
                            : payment.status === 'failed'
                              ? 'bg-sa-red'
                              : 'bg-sa-yellow'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-sa-text truncate">
                          {payment.agentName}
                        </p>
                        <p className="text-[10px] text-sa-text-dim font-mono truncate">
                          {payment.endpoint}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`text-sm font-mono font-medium ${
                            payment.status === 'failed' ? 'text-sa-red line-through' : 'text-sa-text'
                          }`}
                        >
                          ${payment.amount}
                        </p>
                        <p className="text-[10px] text-sa-text-dim">{payment.timestamp}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </PanelBoundary>
          </Card>
        </div>
      </div>
    </div>
  );
}
