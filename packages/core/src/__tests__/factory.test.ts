import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentWalletFactoryClient } from '../factory';
import type { AgentInfo } from '../types';

const OWNER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const AGENT_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
const AGENT_B = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC';

function makeAgent(address: string, owner: string, active = true): AgentInfo {
  return {
    address,
    owner,
    active,
    created_at: 1234567890,
  } as unknown as AgentInfo;
}

describe('AgentWalletFactoryClient', () => {
  let invokeContract: ReturnType<typeof vi>;

  beforeEach(() => {
    invokeContract = vi.fn();
  });

  function makeClient() {
    return new AgentWalletFactoryClient({
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      invokeContract,
    } as any);
  }

  describe('listAgents', () => {
    it('returns typed AgentInfo[] for an owner', async () => {
      const agents = [makeAgent(AGENT_A, OWNER), makeAgent(AGENT_B, OWNER)];
      invokeContract.mockResolved(agents);

      const client = makeClient();
      const result = await client.listAgents(OWNER);

      expect(invokeContract).toHaveBeenCalledWith('get_agents_by_owner', { owner: OWNER });
      expect(result).toEqual(agents);
      expect(result).toHaveLength(2);
      expect(result[0]).matchObject({ address: AGENT_A, owner: OWNER });
    });

    it('returns typed AgentInfo[] when no owner is provided', async () => {
      const agents = [makeAgent(AGENT_A, OWNER)];
      invokeContract.mockResolved(agents);

      const client = makeClient();
      const result = await client.listAgents();

      expect(invokeContract).toHaveBeenCalledWith('get_agents_by_owner');
      expect(result).toEqual(agents);
    });

    it('returns an empty array when the owner has no agents', async () => {
      invokeContract.mockResolved([]);

      const client = makeClient();
      const result = await client.listAgents(OWNER);

      expect(result).toEqual([]);
    });
  });

  describe('totalAgents', () => {
    it('returns the total agent count', async () => {
      invokeContract.mockResolved(42);

      const client = makeClient();
      const result = await client.totalAgents();

      expect(invokeContract).toHaveBeenCalledWith('total_agents');
      expect(result).toBe(42);
    });
  });

  describe('isActiveAgent', () => {
    it('returns true for an active agent', async () => {
      invokeContract.mockResolved(true);

      const client = makeClient();
      const result = await client.isActiveAgent(AGENT_A);

      expect(invokeContract).toHaveBeenCalledWith('is_active_agent', { agent: AGENT_A });
      expect(result).toBe(true);
    });

    it('returns false for an inactive agent', async () => {
      invokeContract.mockResolved(false);

      const client = makeClient();
      const result = await client.isActiveAgent(AGENT_B);

      expect(invokeContract).toHaveBeenCalledWith('is_active_agent', { agent: AGENT_B });
      expect(result).toBe(false);
    });
  });
});
