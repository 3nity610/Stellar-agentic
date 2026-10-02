import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { App } from './App.js';
import { DashboardDataProvider } from './lib/chain/DashboardProvider.js';

/**
 * `DashboardDataProvider` is the outermost wrapper because it owns the single
 * `StellarAgent` every panel reads through, and the mode that decides which
 * one it is. `BrowserRouter` sits above it so the sidebar's mode toggle — and
 * the `?mode=mock` parameter the Playwright suite uses — can change that agent
 * without remounting the router.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DashboardDataProvider>
        <App />
      </DashboardDataProvider>
    </BrowserRouter>
  </StrictMode>,
);
