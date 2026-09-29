/**
 * One component for the three states every panel has to have.
 *
 * The failure this exists to prevent: a panel that renders `data.map(...)` and
 * nothing else shows a blank card while loading, the same blank card when a
 * fetch failed, and a *third* blank card when the chain genuinely has no rows
 * — three different facts presented identically, so an operator cannot tell
 * "nothing has happened yet" from "I am not being told anything".
 *
 * Each state is announced, not just styled: `aria-busy` while loading,
 * `role="alert"` for a failure, and a real empty state for "there is nothing
 * here". The e2e suite asserts on all three, which is the only reason any of
 * them gets looked at.
 */

import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import type { Panel, PanelFailure } from '../../lib/chain/types.js';

const ROWS = 3;

function Skeleton() {
  return (
    <div className="space-y-2 py-2" aria-hidden>
      {Array.from({ length: ROWS }, (_unused, index) => (
        <div
          key={index}
          className="h-8 rounded-md bg-sa-bg border border-sa-border/60 animate-pulse"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}

export interface PanelBoundaryProps<T> {
  panel: Panel<T>;
  /** Rendered once the panel has data. */
  children: (data: T) => ReactNode;
  /** What "no rows" means here, e.g. "No agents in the roster yet." */
  emptyMessage: string;
  /** What to call this panel in the error copy. */
  label: string;
  /** How to tell whether `data` counts as empty. Defaults to `length === 0`. */
  isEmpty?: (data: T) => boolean;
  /** Per-item failures from a fan-out panel, rendered under the rows. */
  failures?: PanelFailure[];
  className?: string;
}

export function PanelBoundary<T>({
  panel,
  children,
  emptyMessage,
  label,
  isEmpty,
  failures = [],
  className,
}: PanelBoundaryProps<T>) {
  const emptyCheck = isEmpty ?? ((data: T) => Array.isArray(data) && data.length === 0);

  if (panel.status === 'error') {
    return (
      <div
        role="alert"
        data-testid="panel-error"
        className={clsx('rounded-lg border border-sa-red/30 bg-sa-red/5 px-4 py-4', className)}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle size={15} className="text-sa-red mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-sa-red font-medium">{label} could not be loaded</p>
            <p className="text-xs text-sa-text-dim mt-1 break-words">
              {panel.error?.message ?? 'Unknown error'}
            </p>
            {panel.refetch && (
              <button
                type="button"
                onClick={panel.refetch}
                className="btn-secondary text-xs py-1.5 px-3 mt-3 flex items-center gap-1.5"
              >
                <RefreshCw size={12} />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // `idle` is not `loading`: nothing is configured to read, and a spinner
  // there would spin forever and imply work is happening.
  if (panel.status === 'idle' || panel.data === null) {
    if (panel.status === 'idle') {
      return (
        <p className={clsx('text-sm text-sa-text-dim py-4', className)} data-testid="panel-idle">
          {label} is not configured.
        </p>
      );
    }
    return (
      <div aria-busy="true" data-testid="panel-loading" className={className}>
        <p className="sr-only">Loading {label}…</p>
        <Skeleton />
      </div>
    );
  }

  if (emptyCheck(panel.data)) {
    return (
      <div className={clsx('py-8', className)} data-testid="panel-empty">
        <div className="flex flex-col items-center justify-center text-sa-text-dim">
          <div className="w-12 h-12 rounded-full border border-sa-border flex items-center justify-center mb-3">
            <Inbox size={18} />
          </div>
          <p className="text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className} data-testid="panel-content">
      {children(panel.data)}
      {failures.length > 0 && (
        <p
          role="alert"
          className="mt-3 text-xs text-sa-yellow border-l-2 border-sa-yellow/40 pl-3"
        >
          {failures.length} of {failures.length + (Array.isArray(panel.data) ? panel.data.length : 0)}{' '}
          {label.toLowerCase()} could not be read:{' '}
          {failures.slice(0, 3).map((failure) => `${failure.id} (${failure.error.message})`).join('; ')}
          {failures.length > 3 ? `, and ${failures.length - 3} more` : ''}
        </p>
      )}
    </div>
  );
}
