import { useCallback } from 'react';
import type { JobInfo } from '@stellaragent/core';
import { useStellarAgent } from '../StellarAgentProvider.js';
import { usePolling, type UsePollingOptions, type UsePollingResult } from '../internal/usePolling.js';

export interface UseJobsFilters {
  role?: string;
  status?: string;
  limit?: number;
}

interface JobLister {
  getJobs(filters: UseJobsFilters): Promise<JobInfo[]>;
}

/** Polls the paginated job list for a worker inbox. Disabled until the agent is `ready`. */
export function useJobs(
  filters: UseJobsFilters = {},
  options?: UsePollingOptions,
): UsePollingResult<JobInfo[]> {
  const { agent, status } = useStellarAgent();

  const fetcher = useCallback(
    () => (agent as unknown as JobLister).getJobs(filters),
    [agent, filters.role, filters.status, filters.limit],
  );

  return usePolling(agent && status === 'ready' ? fetcher : null, options);
}
