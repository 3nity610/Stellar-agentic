import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/dashboard/Sidebar.js';


function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <p className="font-display text-xl font-semibold text-sa-text mb-2">{title}</p>
        <p className="text-sa-text-dim text-sm">Coming soon · Contributions welcome!</p>
        <a
          href="https://github.com/yourusername/stellaragent"
          className="text-sa-accent text-sm hover:underline mt-3 inline-block"
        >
          See CONTRIBUTING.md →
        </a>
      </div>
    </div>
  );
}

/**
 * The application shell.
 *
 * `DashboardAgentBoundary` is what decides whether there is an agent to read
 * from; the pages below it can assume there is one, and never have to check.
 */
export function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <div className="flex min-h-screen bg-sa-bg bg-grid-pattern bg-grid">
          {/* Radial glow overlay */}
          <div className="fixed inset-0 bg-radial-glow pointer-events-none" />

          <Sidebar />

        <main className="flex flex-1 overflow-hidden relative">

        </main>
      </div>
    </BrowserRouter>
  );
}
