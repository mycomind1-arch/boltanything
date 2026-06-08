import { ROUTES, type JobKind, type TickCtx } from './routing';
import * as db from '../adapters/supabase';
import * as n8n from '../adapters/n8n';
import type { JobRow } from '../types';

const TICK_BUDGET_MS = 8000;
const CLAIM_LIMIT = 5;

export interface TickResult { claimed: number; dispatched: number; failed: number; }

export async function runTick(): Promise<TickResult> {
  const start = Date.now();
  const jobs = await db.jobs.claimBatch(CLAIM_LIMIT);
  let dispatched = 0, failed = 0;

  for (const job of jobs) {
    if (Date.now() - start > TICK_BUDGET_MS) break;
    const route = ROUTES[job.kind as JobKind];
    if (!route) { await db.jobs.fail(job.id, 'unknown_kind'); failed++; continue; }

    await db.jobs.setStatus(job.id, 'running');
    if (job.agent_id) await db.agents.setState(job.agent_id, 'running');

    if (!route.workflow) { await handleInProcess(job); dispatched++; continue; }

    const ctx: TickCtx = { buildId: job.build_id, parentAgentId: job.agent_id };
    try {
      const payload = await route.buildPayload(job, ctx);
      await n8n.triggerWorkflow(route.workflow, payload, { buildId: job.build_id, jobId: job.id });
      await db.aiol.append({ buildId: job.build_id, from: 'ORC:tick', to: `N8N:${route.workflow}`, kind: 'task', body: { job_id: job.id, kind: job.kind } });
      dispatched++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.jobs.fail(job.id, msg);
      failed++;
    }
  }
  return { claimed: jobs.length, dispatched, failed };
}

async function handleInProcess(job: JobRow): Promise<void> {
  if (job.kind === 'root.start') {
    const { spawn } = await import('./spawn');
    await spawn({ buildId: job.build_id, parentAgentId: job.agent_id, role: 'librarian', jobKind: 'vault.search', payload: { directive: job.payload.directive } });
    if (job.agent_id) await db.agents.setState(job.agent_id, 'running');
    await db.jobs.setStatus(job.id, 'succeeded');
  }
}
