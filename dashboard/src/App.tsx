import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/dashboard/Sidebar.js';

// Lazy-load pages for code splitting
const OverviewPage = lazy(() => import('./pages/OverviewPage.js').then(m => ({ default: m.OverviewPage })));
const AgentsPage = lazy(() => import('./pages/AgentsPage.js').then(m => ({ default: m.AgentsPage })));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage.js').then(m => ({ default: m.PaymentsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage.js').then(m => ({ default: m.ReportsPage })));
const JobsPage = lazy(() => import('./pages/JobsPage.js').then(m => ({ default: m.JobsPage })));
const AlertsPage = lazy(() => import('./pages/AlertsPage.js').then(m => ({ default: m.AlertsPage })));
const HealthPage = lazy(() => import('./pages/HealthPage.js').then(m => ({ default: m.HealthPage })));

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

export function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-sa-bg bg-grid-pattern bg-grid">
        {/* Radial glow overlay */}
        <div className="fixed inset-0 bg-radial-glow pointer-events-none" />

        <Sidebar />

        <main className="flex flex-1 overflow-hidden relative">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="font-display text-xl font-semibold text-sa-text mb-2">Loading...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/limits" element={<PlaceholderPage title="Rate Limits" />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/health" element={<HealthPage />} />
              <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  );
}
