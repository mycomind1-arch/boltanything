import { CapError } from '../types';
import * as db from '../adapters/supabase';

export async function assertDepth(parentAgentId: string | null): Promise<void> {
  if (!parentAgentId) return;
  let id: string | null = parentAgentId;
  let depth = 0;
  while (id) {
    const agent: { parent_id: string | null } = await db.agents.byId(id);
    id = agent.parent_id;
    depth++;
    if (depth >= 3) throw new CapError('depth');
  }
}

export async function assertFanout(parentAgentId: string | null): Promise<void> {
  if (!parentAgentId) return;
  const siblings = await db.agents.childrenOf(parentAgentId);
  if (siblings.length >= 5) throw new CapError('fanout');
}

export async function assertBudget(buildId: string): Promise<void> {
  const count = await db.agents.countByBuild(buildId);
  if (count >= 40) throw new CapError('budget');
}

export async function assertRepairBudget(buildId: string, agentId: string): Promise<void> {
  const count = await db.jobs.countRepairs(buildId, agentId);
  if (count >= 2) throw new CapError('repair');
}

export async function assertCycle(buildId: string): Promise<void> {
  const build = await db.builds.get(buildId);
  if (build.cycle_count >= 3) throw new CapError('cycle');
}
