/**
 * The live/mock switch.
 *
 * A dashboard that serves fixture data while claiming to be connected to
 * mainnet is worse than one that shows nothing, so the mode is always visible
 * and always one click from the other. The switch is deliberately not a
 * settings page: a demo that needs a URL parameter to look real will be
 * screenshotted in mock mode and relabelled as production.
 */

import { FlaskConical, Radio } from 'lucide-react';
import { useDashboard } from '../../lib/chain/DashboardProvider.js';

export function DataModeBadge() {
  const { config, setMode } = useDashboard();
  const isMock = config.mode === 'mock';

  return (
    <div className="px-3 pb-3">
      <div
        className="flex items-center gap-2 rounded-lg border border-sa-border bg-sa-bg px-2.5 py-2"
        data-testid="data-mode"
        data-mode={config.mode}
      >
        {isMock
          ? <FlaskConical size={13} className="text-sa-yellow shrink-0" />
          : <Radio size={13} className="text-sa-green shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-sa-text leading-tight">
            {isMock ? 'Demo data' : config.network}
          </p>
          <p className="text-[10px] text-sa-text-dim leading-tight truncate">
            {isMock ? 'fixtures, not the chain' : 'reading live chain state'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode(isMock ? 'chain' : 'mock')}
          className="text-[10px] text-sa-accent hover:underline whitespace-nowrap"
        >
          {isMock ? 'Go live' : 'Use demo'}
          <span className="sr-only"> data</span>
        </button>
      </div>
    </div>
  );
}
