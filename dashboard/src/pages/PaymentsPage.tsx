import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, CheckCircle2, XCircle, Clock, Route, ShieldCheck } from 'lucide-react';
import type { PaymentQuote } from '@stellaragent/core';
import { Badge, AddressChip, SectionHeader, Card } from '../components/ui/index.js';
import { PanelBoundary } from '../components/dashboard/PanelBoundary.js';
import { usePaymentsPanel } from '../lib/chain/panels.js';
import { useDashboard } from '../lib/chain/DashboardProvider.js';
import { fmt, sumAmounts } from '../lib/deterministic-math.js';
import {
  buildPaymentPreview,
  dashboardRouteCandidates,
  displayBaseUnits,
  displayBasisPoints,
  formatRoutePath,
} from '../lib/routingPreview.js';

const inputClass = 'w-full bg-sa-bg border border-sa-border rounded-lg px-3 py-2 text-sm text-sa-text focus:outline-none focus:border-sa-accent/60';
const fieldLabel = 'label block mb-1.5';

function statusIcon(status: string) {
  if (status === 'success') return <CheckCircle2 size={14} className="text-sa-green" />;
  if (status === 'failed') return <XCircle size={14} className="text-sa-red" />;
  return <Clock size={14} className="text-sa-yellow" />;
}

function statusBadge(status: string) {
  if (status === 'success') return <Badge variant="success">Success</Badge>;
  if (status === 'failed') return <Badge variant="danger">Failed</Badge>;
  return <Badge variant="warning">Pending</Badge>;
}

export function PaymentsPage() {
  const [sourceAsset, setSourceAsset] = useState('XLM');
  const [destinationAsset, setDestinationAsset] = useState('USDC');
  const [amount, setAmount] = useState('25.0000000');
  const [preview, setPreview] = useState<PaymentQuote | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const panel = usePaymentsPanel();
  const { config } = useDashboard();
  const payments = panel.data ?? [];
  const totalSuccess = payments.filter((p) => p.status === 'success').length;
  const totalFailed = payments.filter((p) => p.status === 'failed').length;
  // Deterministic sum: use bignumber.js to avoid float drift between ARM and x86
  const totalVolume = fmt(
    sumAmounts(payments.filter((p) => p.status === 'success').map((p) => p.amount)),
    4,
  );

  function invalidatePreview(): void {
    setPreview(null);
    setPreviewError('');
    setConfirmed(false);
  }

  function submitPreview(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPreviewError('');
    setConfirmed(false);
    try {
      const candidates = dashboardRouteCandidates(sourceAsset, destinationAsset, amount);
      const next = buildPaymentPreview(candidates);
      setPreview(next);
      if (!next) setPreviewError('No route has enough liquidity for this payment.');
    } catch (error) {
      setPreview(null);
      setPreviewError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b border-sa-border px-8 py-5 bg-sa-bg/50 backdrop-blur sticky top-0 z-10">
        <h1 className="font-display text-xl font-semibold text-sa-text">Payments</h1>
        <p className="text-xs text-sa-text-dim mt-0.5">On-chain audit trail for all agent payments</p>
      </div>

      <div className="p-8 space-y-6">
        <Card>
          <SectionHeader
            title="Route a payment"
            subtitle="Compare normalized venue quotes and review the exact route before confirming"
          />
          <form className="grid gap-4 lg:grid-cols-[1fr_1fr_1.25fr_auto] lg:items-end" onSubmit={submitPreview}>
            <label>
              <span className={fieldLabel}>Agent pays with</span>
              <select
                aria-label="Source asset"
                className={inputClass}
                value={sourceAsset}
                onChange={(event) => { setSourceAsset(event.target.value); invalidatePreview(); }}
              >
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
                <option value="AQUA">AQUA</option>
              </select>
            </label>
            <label>
              <span className={fieldLabel}>Recipient wants</span>
              <select
                aria-label="Destination asset"
                className={inputClass}
                value={destinationAsset}
                onChange={(event) => { setDestinationAsset(event.target.value); invalidatePreview(); }}
              >
                <option value="USDC">USDC</option>
                <option value="XLM">XLM</option>
                <option value="AQUA">AQUA</option>
              </select>
            </label>
            <label>
              <span className={fieldLabel}>Source amount</span>
              <input
                aria-label="Source amount"
                className={`${inputClass} font-mono`}
                inputMode="decimal"
                value={amount}
                onChange={(event) => { setAmount(event.target.value); invalidatePreview(); }}
              />
            </label>
            <button type="submit" className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap">
              <Route size={15} /> Preview route
            </button>
          </form>

          {previewError && (
            <p role="alert" className="mt-4 rounded-lg border border-sa-red/30 bg-sa-red/5 px-4 py-3 text-sm text-sa-red">
              {previewError}
            </p>
          )}

          {preview && (
            <div data-testid="route-preview" className="mt-5 border-t border-sa-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={17} className="text-sa-green" />
                  <h3 className="font-display font-semibold text-sa-text">Selected route</h3>
                  <Badge variant="success">Deterministic</Badge>
                </div>
                <p className="font-mono text-xs text-sa-text-dim">score {preview.route.score}</p>
              </div>
              <p className="rounded-lg border border-sa-accent/20 bg-sa-accent/5 px-4 py-3 font-mono text-sm text-sa-accent">
                {formatRoutePath(preview.route)}
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 mt-5 md:grid-cols-3">
                <PreviewValue label="You pay" value={`${displayBaseUnits(preview.route.sourceAmount)} ${preview.route.sourceAsset}`} />
                <PreviewValue label="Recipient receives" value={`${displayBaseUnits(preview.route.expectedDestinationAmount)} ${preview.route.destinationAsset}`} />
                <PreviewValue label="Minimum received" value={`${displayBaseUnits(preview.minimumDestinationAmount)} ${preview.route.destinationAsset}`} />
                <PreviewValue label="Estimated fees" value={`${preview.route.totalFeeBps} bps (${displayBasisPoints(preview.route.totalFeeBps)})`} />
                <PreviewValue label="Expected slippage" value={`${preview.route.expectedSlippageBps} bps (${displayBasisPoints(preview.route.expectedSlippageBps)})`} />
                <PreviewValue label="Quote expiry" value={`Ledger ${preview.validUntilLedger}`} />
                <PreviewValue label="Reliability" value={displayBasisPoints(preview.route.reliabilityBps)} />
                <PreviewValue label="Route depth" value={`${preview.route.hopCount} economic hop${preview.route.hopCount === 1 ? '' : 's'}`} />
              </dl>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary flex items-center gap-2"
                  onClick={() => setConfirmed(true)}
                  disabled={confirmed}
                >
                  <CheckCircle2 size={15} /> Confirm routed payment
                </button>
                <p className="text-xs text-sa-text-dim">The quote remains unchanged between preview and submission.</p>
              </div>
              {confirmed && (
                <p role="status" className="mt-4 text-sm text-sa-green">
                  Route confirmed. The selected quote is ready for atomic submission.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Successful', value: totalSuccess.toString() },
            { label: 'Failed', value: totalFailed.toString() },
            { label: 'Volume (USDC)', value: `$${totalVolume}` },
          ].map(({ label, value }) => (
            <Card key={label}>
              <p className="label mb-2">{label}</p>
              <p className="font-display text-2xl font-semibold text-sa-text">{value}</p>
            </Card>
          ))}
        </div>

        {/* Table */}
        <Card>
          <SectionHeader title="Transaction Feed" subtitle="Most recent first" />
          <PanelBoundary
            panel={panel}
            label="Payments"
            emptyMessage={
              config.indexerUrl
                ? 'No channel payments have been indexed yet.'
                : 'Set VITE_STELLARAGENT_INDEXER_URL to show the payment feed.'
            }
          >
            {(rows) => (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sa-border">
                      {['Status', 'Agent', 'Endpoint', 'Amount', 'Recipient', 'Ledger', 'Time'].map((h) => (
                        <th key={h} className="label text-left py-2.5 px-3 first:pl-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p, i) => (
                      <motion.tr
                        key={p.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className="border-b border-sa-border/50 hover:bg-sa-bg/40 transition-colors"
                      >
                        <td className="py-3 px-3 first:pl-0">
                          <div className="flex items-center gap-2">
                            {statusIcon(p.status)}
                            {statusBadge(p.status)}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <p className="text-sa-text font-medium text-xs">{p.agentName}</p>
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-mono text-xs text-sa-text-dim truncate max-w-[180px]">
                            {p.endpoint}
                          </p>
                        </td>
                        <td className="py-3 px-3">
                          <p className={`font-mono text-sm font-medium ${
                            p.status === 'failed' ? 'text-sa-red line-through' : 'text-sa-text'
                          }`}>
                            ${p.amount}
                          </p>
                        </td>
                        <td className="py-3 px-3">
                          <AddressChip address={p.recipient} />
                        </td>
                        <td className="py-3 px-3">
                          <a
                            href={explorerHref(config.network, p.txHash, p.ledger)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-sa-accent hover:underline flex items-center gap-1"
                          >
                            #{p.ledger}
                            <ArrowUpRight size={10} />
                          </a>
                        </td>
                        <td className="py-3 px-3">
                          <p className="text-xs text-sa-text-dim">{p.timestamp}</p>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PanelBoundary>
        </Card>
      </div>
    </div>
  );
}

/**
 * Link to the transaction when the source gave us a hash, and to the ledger
 * when it did not.
 *
 * A mock row has no hash, and a `#<ledger>` link that silently points at a
 * ledger rather than a transaction is a small lie in the one place an operator
 * would go to check something.
 */
function explorerHref(
  network: string,
  txHash: string | undefined,
  ledger: number,
): string {
  const host = network === 'mainnet' ? 'mainnet' : 'testnet';
  if (txHash) return `https://stellar.expert/explorer/${host}/tx/${txHash}`;
  return `https://stellar.expert/explorer/${host}/ledger/${ledger}`;
}

function PreviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label mb-1">{label}</dt>
      <dd className="font-mono text-sm text-sa-text">{value}</dd>
    </div>
  );
}
