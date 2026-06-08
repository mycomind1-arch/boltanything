import * as db from '../adapters/supabase';
import * as caps from './caps';
import { spawn } from './spawn';
import { embedText } from '../aiol/embed';
import type { AIOLMessage } from '../aiol/envelope';
import type { AgentRole } from '../types';

export interface CallbackResult { enqueued: number; }

export async function handleCallback(msg: AIOLMessage): Promise<CallbackResult> {
  const buildId = msg.build_id;
  let enqueued = 0;

  switch (msg.kind) {
    case 'plan': {
      const capabilities = (msg.body.capabilities as Array<Record<string, unknown>>) ?? [];
      for (const cap of capabilities) {
        await spawn({ buildId, parentAgentId: msg.agent_id ?? null, role: 'coder' as AgentRole, jobKind: 'coder.generate', payload: { capability: cap, files_context: [], vault_hits: [] } });
        enqueued++;
      }
      break;
    }
    case 'evidence': {
      const from = (msg.body.from as string) ?? '';
      if (from === 'coder' || from === 'docwright') {
        const files = (msg.body.files as Array<Record<string, string>>) ?? [];
        for (const f of files) await db.files.upsert({ buildId, path: f.path, content: f.content, mime: f.mime ?? 'text/plain' });
        if (from === 'coder') { await spawn({ buildId, parentAgentId: msg.agent_id ?? null, role: 'critic', jobKind: 'critic.gate', payload: { files } }); enqueued++; }
        else {
          const allFiles = await db.files.byBuild(buildId);
          for (const f of allFiles.filter(f => f.evidence_status === 'pending')) await db.files.setEvidence(f.id, 'ok');
        }
      } else if (from === 'critic') {
        const results = (msg.body.results as Array<Record<string, string>>) ?? [];
        const agentStatus = (msg.body.agent_status as string) ?? 'ok';
        for (const r of results) { const existing = await db.files.read(buildId, r.path); if (existing) await db.files.setEvidence(existing.id, r.status === 'ok' ? 'ok' : 'failed', r.notes); }
        if (agentStatus === 'failed') {
          const failedFiles = results.filter(r => r.status === 'failed');
          if (msg.agent_id) {
            try { await caps.assertRepairBudget(buildId, msg.agent_id); await spawn({ buildId, parentAgentId: msg.parent_id ?? null, role: 'coder', jobKind: 'coder.repair', payload: { capability: {}, failed_files: failedFiles } }); enqueued++; }
            catch { await db.agents.setState(msg.agent_id, 'collapsed'); }
          }
        } else if (agentStatus === 'ok') {
          const buildAgents = await db.agents.byBuild(buildId);
          const coders = buildAgents.filter(a => a.role === 'coder');
          if (coders.length === 0 || coders.every(c => c.state === 'collapsed' || c.state === 'failed')) {
            const allFiles = await db.files.byBuild(buildId);
            await spawn({ buildId, parentAgentId: msg.agent_id ?? null, role: 'docwright', jobKind: 'docs.write', payload: { files: allFiles.map(f => ({ path: f.path, content: f.content })), directive: '' } });
            enqueued++;
          }
        }
      }
      break;
    }
    case 'repair': {
      const files = (msg.body.files as Array<Record<string, string>>) ?? [];
      for (const f of files) await db.files.upsert({ buildId, path: f.path, content: f.content, mime: f.mime ?? 'text/plain' });
      await spawn({ buildId, parentAgentId: msg.agent_id ?? null, role: 'critic', jobKind: 'critic.gate', payload: { files } });
      enqueued++;
      break;
    }
    case 'vault': {
      const scope = (msg.body.scope as string) ?? '';
      if (scope === 'read') {
        const hits = (msg.body.hits as Array<Record<string, unknown>>) ?? [];
        const rootAgent = (await db.agents.byBuild(buildId)).find(a => a.role === 'root');
        if (rootAgent) await db.agents.setMeta(rootAgent.id, { ...rootAgent.meta, vault_hits: hits });
        await spawn({ buildId, parentAgentId: msg.agent_id ?? null, role: 'architect', jobKind: 'architect.decompose', payload: { directive: (msg.body as Record<string, unknown>).directive ?? '', vault_hits: hits } });
        enqueued++;
      } else if (scope === 'write') {
        const entry = (msg.body.entry ?? {}) as Record<string, unknown>;
        const embedding = await embedText((entry.pattern as string) ?? '', buildId);
        await db.vault.write({ buildId, pattern: (entry.pattern as string) ?? '', evidence: (entry.evidence as Record<string, unknown>) ?? {}, embedding, nextUseCase: (entry.next_use_case as string) ?? undefined });
        await db.builds.updateStatus(buildId, 'succeeded');
      }
      break;
    }
    case 'collapse': { if (msg.agent_id) await db.agents.setState(msg.agent_id, 'collapsed'); break; }
    case 'spawn': {
      await spawn({ buildId, parentAgentId: msg.agent_id ?? null, role: (msg.body.role as AgentRole) ?? 'coder', jobKind: (msg.body.kind as string) ?? 'coder.generate', payload: (msg.body.payload as Record<string, unknown>) ?? {} });
      enqueued++;
      break;
    }
    case 'log': break;
    case 'task': break;
  }

  await db.aiol.append({ buildId, from: msg.from, to: msg.to, kind: msg.kind, body: msg.body });
  return { enqueued };
}
