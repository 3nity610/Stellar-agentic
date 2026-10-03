'use client';

import type { ReactNode } from 'react';
import { StellarAgentProvider } from '@stellaragent/react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <StellarAgentProvider config={{ network: 'testnet' }}>
      {children}
    </StellarAgentProvider>
  );
}
