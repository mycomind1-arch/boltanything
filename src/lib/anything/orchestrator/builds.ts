import * as db from '../adapters/supabase';
import { spawn } from './spawn';

export async function start(opts: { ownerId: string; directive: string; autoCycle?: boolean }) {
  const build = await db.builds.create({ owner_id: opts.ownerId, directive: opts.directive, status: 'queued', mode: 'build', auto_cycle: opts.autoCycle ?? false });
  const { agentId, jobId } = await spawn({ buildId: build.id, parentAgentId: null, role: 'root', jobKind: 'root.start', payload: { directive: opts.directive } });
  return { buildId: build.id, agentId, jobId };
}

export async function get(buildId: string) {
  const build = await db.builds.get(buildId);
  const agentCount = await db.agents.countByBuild(buildId);
  const allFiles = await db.files.byBuild(buildId);
  return { ...build, agent_count: agentCount, file_count: allFiles.length };
}

export async function snapshot(buildId: string) {
  const build = await db.builds.get(buildId);
  const allAgents = await db.agents.byBuild(buildId);
  const allFiles = await db.files.byBuild(buildId);
  return { build, agents: allAgents, files: allFiles };
}

export async function list(ownerId: string, limit = 50) { return db.builds.list(ownerId, limit); }

export async function cancel(buildId: string) {
  await db.builds.updateStatus(buildId, 'failed');
  const admin = await db.getAdmin();
  await admin.from('jobs').update({ status: 'failed', last_error: 'cancelled' }).eq('build_id', buildId).in('status', ['queued', 'claimed', 'running']);
  await admin.from('agents').update({ state: 'failed' }).eq('build_id', buildId).in('state', ['pending', 'running']);
}
