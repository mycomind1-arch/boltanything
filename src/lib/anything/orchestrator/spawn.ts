import * as caps from './caps';
import * as db from '../adapters/supabase';
import type { AgentRole } from '../types';

export async function spawn(opts: {
  buildId: string; parentAgentId: string | null; role: AgentRole; jobKind: string; payload: Record<string, unknown>;
}): Promise<{ agentId: string; jobId: string }> {
  await caps.assertDepth(opts.parentAgentId);
  await caps.assertFanout(opts.parentAgentId);
  await caps.assertBudget(opts.buildId);

  const admin = await db.getAdmin();
  const { data, error } = await admin.rpc('spawn_agent_with_job', {
    p_build_id: opts.buildId, p_parent_id: opts.parentAgentId, p_role: opts.role, p_kind: opts.jobKind, p_payload: opts.payload,
  });
  if (error) throw new Error(error.message);
  const row = data[0];
  return { agentId: row.agent_id, jobId: row.job_id };
}
