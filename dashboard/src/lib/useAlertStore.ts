/**
 * Alert Store — Issue #257
 * Manages alert state, configurable thresholds (client-side),
 * webhook config, and live event simulation/polling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  runAllHeuristics,
  DEFAULT_THRESHOLDS,
  type AgentEvent,
  type FiredAlert,
  type AlertThresholds,
} from './alertHeuristics';
import { fireWebhooksForAlerts, type WebhookConfig } from './webhookService';
import { MOCK_AGENTS, MOCK_PAYMENTS } from './mockData';
import { useDashboard } from './chain/DashboardProvider';
import type { Agent } from './chain/types';

// ─── Persist thresholds & webhook config in localStorage ─────────────────────

const THRESHOLDS_KEY = 'sa_alert_thresholds';
const WEBHOOK_KEY = 'sa_webhook_config';

function loadThresholds(): AlertThresholds {
  try {
    const raw = localStorage.getItem(THRESHOLDS_KEY);
    if (raw) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    // Unreadable or malformed storage — fall back to the defaults below.
  }
  return DEFAULT_THRESHOLDS;
}

function saveThresholds(t: AlertThresholds) {
  localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(t));
}

function loadWebhookConfig(): WebhookConfig {
  try {
    const raw = localStorage.getItem(WEBHOOK_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Unreadable or malformed storage — fall back to webhooks disabled.
  }
  return { enabled: false, url: '' };
}

function saveWebhookConfig(c: WebhookConfig) {
  localStorage.setItem(WEBHOOK_KEY, JSON.stringify(c));
}

// ─── Seed mock event history from MOCK_AGENTS & MOCK_PAYMENTS ────────────────

/**
 * Build a plausible event history for one agent.
 *
 * The heuristics this feeds are rate-of-spend detectors, and they need a
 * *series* to detect anything — one snapshot cannot be a velocity. In live
 * mode the series comes from the agents panel instead; this is what the alerts
 * page falls back to so it still has something to show before the first poll
 * lands, and what it uses outright in mock mode.
 */
function seedEventsForAgent(agent: Agent): AgentEvent[] {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const events: AgentEvent[] = [];

  const hourlyLimit = Number.parseFloat(agent.limitPerHour) || 1;
  const histAvg = (Number.parseFloat(agent.spentToday) || 0) / 24;

  // 8 hours of history
  for (let h = 8; h >= 1; h -= 1) {
    events.push({
      agentId: agent.id,
      agentName: agent.name,
      kind: 'payment',
      amount: histAvg,
      windowTs: now - h * oneHour,
    });
  }

  // Current hour spend (from MOCK_PAYMENTS)
  const agentPayments = MOCK_PAYMENTS.filter(
    (payment) => payment.agentId === agent.id && payment.status === 'success',
  );
  if (agentPayments.length > 0) {
    const currentSpend = agentPayments.reduce((sum, payment) => sum + Number.parseFloat(payment.amount), 0);
    events.push({
      agentId: agent.id,
      agentName: agent.name,
      kind: 'payment',
      amount: currentSpend,
      windowTs: now - 5 * 60 * 1000,
    });
  }

  // Near-limit data for the agent already in a warning state.
  if (agent.status === 'warning') {
    const txPerHour = Math.round(((Number.parseFloat(agent.spentThisHour) || 0) / hourlyLimit) * 40);
    for (let h = 4; h >= 0; h -= 1) {
      events.push({
        agentId: agent.id,
        agentName: agent.name,
        kind: 'near_limit',
        hourlyTxCount: txPerHour,
        maxTxsPerHour: 40,
        windowTs: now - h * oneHour,
      });
    }
  }

  return events;
}

function buildSeedEvents(agents: readonly Agent[] = MOCK_AGENTS): AgentEvent[] {
  return agents.flatMap(seedEventsForAgent);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param agents the agents panel's rows, so alerts are derived from chain
 * state rather than from fixtures. Defaults to the mock roster; in live mode
 * the caller passes the real rows and the seeds are rebuilt whenever they
 * change.
 */
export function useAlertStore(agents: readonly Agent[] = MOCK_AGENTS) {
  const [thresholds, setThresholdsState] = useState<AlertThresholds>(loadThresholds);
  const [webhookConfig, setWebhookConfigState] = useState<WebhookConfig>(loadWebhookConfig);
  const [events, setEvents] = useState<AgentEvent[]>(() => buildSeedEvents(agents));
  const [alerts, setAlerts] = useState<FiredAlert[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const prevAlertIds = useRef<Set<string>>(new Set());

  // Re-seed when the roster changes, so a live dashboard's alerts describe the
  // agents it is actually watching.
  const rosterKey = agents.map((agent) => `${agent.id}:${agent.spentThisHour}`).join('|');
  const roster = agents;
  useEffect(() => {
    setEvents((previous) => {
      const rebuilt = buildSeedEvents(agents);
      // Keep anything the live-tail injected, so a re-seed does not silently
      // drop events the operator is looking at.
      const seeded = new Set(rebuilt.map((event) => `${event.agentId}:${event.windowTs}:${event.kind}`));
      return [...rebuilt, ...previous.filter((event) => !seeded.has(`${event.agentId}:${event.windowTs}:${event.kind}`))];
    });
    // `agents` is intentionally represented by `rosterKey`; it is a new array
    // on every poll, and re-seeding on identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey]);

  // Run heuristics whenever events or thresholds change
  useEffect(() => {
    const all = runAllHeuristics(events, thresholds);
    setAlerts(all);

    // Fire webhooks only for newly-fired alerts
    const newAlerts = all.filter((a) => !prevAlertIds.current.has(a.id));
    if (newAlerts.length > 0) {
      fireWebhooksForAlerts(newAlerts, webhookConfig);
    }
    prevAlertIds.current = new Set(all.map((a) => a.id));
  }, [events, thresholds, webhookConfig]);

  // Live tail: inject a new event every 8s.
  //
  // Mock mode only. In live mode the events *are* the chain's payment feed, so
  // injecting synthetic ones would put payments on the screen that never
  // happened — which for an alerting surface is the worst possible bug.
  const isMock = useDashboard().config.mode === 'mock';
  useEffect(() => {
    if (!isMock || roster.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const agent = roster[Math.floor(Math.random() * roster.length)];
      if (!agent) return;
      const isBurst = Math.random() < 0.15; // 15% chance of burst payment
      const limit = Number.parseFloat(agent.limitPerHour) || 1;
      setEvents((prev) => [
        ...prev,
        {
          agentId: agent.id,
          agentName: agent.name,
          kind: 'payment',
          amount: isBurst ? limit * 0.9 : 0.01 + Math.random() * 0.05,
          windowTs: now,
        },
      ]);
    }, 8000);

    return () => clearInterval(timer);
    // `roster` is represented by `rosterKey`: it is a fresh array on every
    // poll, and depending on its identity would reset the timer each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMock, rosterKey]);

  const setThresholds = useCallback((t: AlertThresholds) => {
    setThresholdsState(t);
    saveThresholds(t);
  }, []);

  const setWebhookConfig = useCallback((c: WebhookConfig) => {
    setWebhookConfigState(c);
    saveWebhookConfig(c);
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const injectRateLimitHit = useCallback((agentId: string, agentName: string) => {
    setEvents((prev) => [
      ...prev,
      {
        agentId,
        agentName,
        kind: 'rate_limit_hit',
        windowTs: Date.now(),
      },
    ]);
  }, []);

  const injectAgentKilled = useCallback((agentId: string, agentName: string) => {
    setEvents((prev) => [
      ...prev,
      {
        agentId,
        agentName,
        kind: 'agent_killed',
        windowTs: Date.now(),
      },
    ]);
  }, []);

  const visibleAlerts = alerts.filter((a) => !dismissedIds.has(a.id));

  return {
    alerts: visibleAlerts,
    allAlerts: alerts,
    thresholds,
    setThresholds,
    webhookConfig,
    setWebhookConfig,
    dismissAlert,
    injectRateLimitHit,
    injectAgentKilled,
    eventCount: events.length,
  };
}
