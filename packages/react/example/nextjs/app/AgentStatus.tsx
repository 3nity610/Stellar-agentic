'use client';

import { useStellarAgent } from '@stellaragent/react';

export function AgentStatus() {
  const { agent, error, status } = useStellarAgent();

  return (
    <dl>
      <dt>Provider status</dt>
      <dd data-testid="agent-status">{status}</dd>
      <dt>Agent address</dt>
      <dd>{agent?.address ?? 'not initialized yet'}</dd>
      {error ? (
        <>
          <dt>Initialization error</dt>
          <dd>{error.message}</dd>
        </>
      ) : null}
    </dl>
  );
}
