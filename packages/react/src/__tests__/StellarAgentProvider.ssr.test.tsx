/** @vitest-environment node */

import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StellarAgent } from '@stellaragent/core';
import {
  StellarAgentProvider,
  useStellarAgent,
} from '../StellarAgentProvider.js';
import { useChannel } from '../hooks/useChannel.js';

function ServerProbe() {
  const { agent, status } = useStellarAgent();
  const channel = useChannel(undefined);

  return (
    <div
      data-agent={agent?.address ?? 'none'}
      data-channel-status={channel.status}
      data-status={status}
    >
      server-safe
    </div>
  );
}

describe('StellarAgentProvider SSR', () => {
  it('renders without browser globals or starting client effects', () => {
    const create = vi.spyOn(StellarAgent, 'create');

    expect(typeof window).toBe('undefined');

    const html = renderToString(
      <StellarAgentProvider config={{ network: 'testnet' }}>
        <ServerProbe />
      </StellarAgentProvider>,
    );

    expect(html).toContain('server-safe');
    expect(html).toContain('data-status="idle"');
    expect(html).toContain('data-channel-status="idle"');
    expect(create).not.toHaveBeenCalled();

    create.mockRestore();
  });

  it('can server-render the injected-agent path without initialization', () => {
    const create = vi.spyOn(StellarAgent, 'create');
    const injectedAgent = { address: 'GSSRDEMO' } as StellarAgent;

    const html = renderToString(
      <StellarAgentProvider
        config={{ network: 'testnet' }}
        agent={injectedAgent}
      >
        <ServerProbe />
      </StellarAgentProvider>,
    );

    expect(html).toContain('data-status="ready"');
    expect(html).toContain('data-agent="GSSRDEMO"');
    expect(create).not.toHaveBeenCalled();

    create.mockRestore();
  });
});
