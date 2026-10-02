import { motion } from 'framer-motion';
import { Plus, Clock, CheckCircle2, AlertCircle, Wallet } from 'lucide-react';
import { Badge, Card, SectionHeader, AddressChip } from '../components/ui/index.js';
import { MOCK_JOBS, type Job } from '../lib/mockData.js';
import { useWallet } from '../lib/walletContext.js';

function JobStatusBadge({ status }: { status: Job['status'] }) {
  const map: Record<Job['status'], { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
    open: { label: 'Open', variant: 'info' },
    in_progress: { label: 'In Progress', variant: 'warning' },
    pending_release: { label: 'Pending Release', variant: 'warning' },
    completed: { label: 'Completed', variant: 'success' },
    refunded: { label: 'Refunded', variant: 'neutral' },
    disputed: { label: 'Disputed', variant: 'danger' },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function JobsPage() {
  const { isConnected, connect } = useWallet();
  const open = MOCK_JOBS.filter((j) => j.status === 'open').length;
  const pending = MOCK_JOBS.filter((j) => j.status === 'pending_release').length;

  const handleWriteAction = async (action: () => void) => {
    if (!isConnected) {
      try {
        await connect();
      } catch (err) {
        console.error('Failed to connect wallet:', err);
        return;
      }
    }
    action();
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b border-sa-border px-8 py-5 flex items-center justify-between bg-sa-bg/50 backdrop-blur sticky top-0 z-10">
        <div>
          <h1 className="font-display text-xl font-semibold text-sa-text">Escrow Jobs</h1>
          <p className="text-xs text-sa-text-dim mt-0.5">Agent-to-agent work delegation with trustless payment</p>
        </div>
        <button
          className="btn-primary flex items-center gap-2 text-sm"
          onClick={() => handleWriteAction(() => {
            console.log('Create job clicked');
            // TODO: Implement job creation with wallet signing
          })}
        >
          <Plus size={14} />
          Create Job
        </button>
      </div>

      <div className="p-8 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <p className="label mb-2">Open Jobs</p>
            <p className="font-display text-2xl font-semibold text-sa-accent">{open}</p>
            <p className="text-xs text-sa-text-dim mt-1">Waiting for workers</p>
          </Card>
          <Card>
            <p className="label mb-2">Pending Release</p>
            <p className="font-display text-2xl font-semibold text-sa-yellow">{pending}</p>
            <p className="text-xs text-sa-text-dim mt-1">Work done, awaiting approval</p>
          </Card>
          <Card>
            <p className="label mb-2">Total Jobs</p>
            <p className="font-display text-2xl font-semibold text-sa-text">{jobs.length}</p>
            <p className="text-xs text-sa-text-dim mt-1">All time</p>
          </Card>
        </div>

        {/* Jobs list */}
        <Card>
          <SectionHeader title="All Jobs" />
          <PanelBoundary
            panel={panel}
            label="Escrow jobs"
            emptyMessage="No escrow jobs in the roster yet. Add job IDs to VITE_STELLARAGENT_JOBS."
            failures={panel.failures}
          >
            {(rows) => (
              <div className="space-y-3">
                {rows.map((job, i) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="border border-sa-border rounded-xl p-4 hover:border-sa-accent/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <JobStatusBadge status={job.status} />
                          <span className="text-xs text-sa-text-dim font-mono">#{job.id}</span>
                        </div>
                        <p className="text-sm text-sa-text font-medium mb-3 line-clamp-2">
                          {job.task}
                        </p>
                        <div className="flex flex-wrap gap-4 text-xs text-sa-text-dim">
                          <div>
                            <span className="label">Requester </span>
                            <span className="text-sa-text">{job.requesterName}</span>
                            <span className="ml-1"><AddressChip address={job.requester} /></span>
                          </div>
                          <div>
                            <span className="label">Worker </span>
                            {job.workerName ? (
                              <>
                                <span className="text-sa-text">{job.workerName}</span>
                                <span className="ml-1"><AddressChip address={job.worker!} /></span>
                              </>
                            ) : (
                              <span className="text-sa-muted italic">Not yet assigned</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="label">Worker </span>
                        {job.workerName ? (
                          <>
                            <span className="text-sa-text">{job.workerName}</span>
                            <span className="ml-1"><AddressChip address={job.worker!} /></span>
                          </>
                        ) : (
                          <span className="text-sa-text-dim italic">Not yet assigned</span>
                        )}
                      </div>
                    </div>

                {/* Actions */}
                {job.status === 'pending_release' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-sa-border">
                    <button
                      className="btn-primary text-xs py-1.5 flex items-center gap-1.5"
                      onClick={() => handleWriteAction(() => {
                        console.log('Release payment for job:', job.id);
                        // TODO: Implement payment release with wallet signing
                      })}
                    >
                      {!isConnected && <Wallet size={12} />}
                      <CheckCircle2 size={12} />
                      {isConnected ? 'Release Payment' : 'Connect & Release'}
                    </button>
                    <button
                      className="btn-secondary text-xs py-1.5 flex items-center gap-1.5 text-sa-red border-sa-red/30 hover:bg-sa-red/5"
                      onClick={() => handleWriteAction(() => {
                        console.log('Dispute job:', job.id);
                        // TODO: Implement dispute with wallet signing
                      })}
                    >
                      <AlertCircle size={12} />
                      Dispute
                    </button>
                  </div>
                )}
                {job.status === 'open' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-sa-border">
                    <button
                      className="btn-secondary text-xs py-1.5"
                      onClick={() => handleWriteAction(() => {
                        console.log('Accept job:', job.id);
                        // TODO: Implement job acceptance with wallet signing
                      })}
                    >
                      {!isConnected && <Wallet size={12} className="inline mr-1" />}
                      {isConnected ? 'Accept Job' : 'Connect & Accept'}
                    </button>
                    <button
                      className="btn-secondary text-xs py-1.5 text-sa-red border-sa-red/30"
                      onClick={() => handleWriteAction(() => {
                        console.log('Cancel & refund job:', job.id);
                        // TODO: Implement cancellation with wallet signing
                      })}
                    >
                      Cancel & Refund
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
