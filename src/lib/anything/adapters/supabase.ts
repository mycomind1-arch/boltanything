import type {
  BuildRow, AgentRow, JobRow, FileRow, VaultRow,
  BuildStatus, AgentState, JobStatus, EvidenceStatus
} from '../types';

export async function getAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY!);
}

export const builds = {
  async create(input: Partial<BuildRow> & Pick<BuildRow, 'owner_id' | 'directive'>): Promise<BuildRow> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('builds').insert(input).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  async get(id: string): Promise<BuildRow> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('builds').select().eq('id', id).single();
    if (error) throw new Error(error.message);
    return data;
  },
  async list(ownerId: string, limit = 50): Promise<BuildRow[]> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('builds').select()
      .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return data;
  },
  async updateStatus(id: string, status: BuildStatus): Promise<void> {
    const admin = await getAdmin();
    const { error } = await admin.from('builds').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async updateMeta(id: string, meta: Record<string, unknown>): Promise<void> {
    const admin = await getAdmin();
    const { error } = await admin.from('builds').update({ meta, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  },
};

export const agents = {
  async create(input: Partial<AgentRow> & Pick<AgentRow, 'build_id' | 'role'>): Promise<AgentRow> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('agents').insert(input).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  async byBuild(buildId: string): Promise<AgentRow[]> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('agents').select().eq('build_id', buildId);
    if (error) throw new Error(error.message);
    return data;
  },
  async setState(id: string, state: AgentState): Promise<void> {
    const admin = await getAdmin();
    const { error } = await admin.from('agents').update({ state }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async setMeta(id: string, meta: Record<string, unknown>): Promise<void> {
    const admin = await getAdmin();
    const { error } = await admin.from('agents').update({ meta }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async countByBuild(buildId: string): Promise<number> {
    const admin = await getAdmin();
    const { count, error } = await admin.from('agents').select('*', { count: 'exact', head: true }).eq('build_id', buildId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async childrenOf(parentId: string): Promise<AgentRow[]> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('agents').select().eq('parent_id', parentId);
    if (error) throw new Error(error.message);
    return data;
  },
  async byId(id: string): Promise<AgentRow> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('agents').select().eq('id', id).single();
    if (error) throw new Error(error.message);
    return data;
  },
};

export const jobs = {
  async enqueue(input: { buildId: string; agentId?: string; kind: string; payload: Record<string, unknown> }): Promise<JobRow> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('jobs').insert({
      build_id: input.buildId, agent_id: input.agentId ?? null, kind: input.kind, payload: input.payload,
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  async claimBatch(limit = 5): Promise<JobRow[]> {
    const admin = await getAdmin();
    const { data, error } = await admin.rpc('claim_jobs', { p_limit: limit });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async setStatus(id: string, status: JobStatus): Promise<void> {
    const admin = await getAdmin();
    const { error } = await admin.from('jobs').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async fail(id: string, errorMsg: string): Promise<void> {
    const admin = await getAdmin();
    const { error } = await admin.from('jobs').update({ status: 'failed', last_error: errorMsg }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async countRepairs(buildId: string, agentId: string): Promise<number> {
    const admin = await getAdmin();
    const { count, error } = await admin.from('jobs').select('*', { count: 'exact', head: true })
      .eq('build_id', buildId).eq('agent_id', agentId).eq('kind', 'coder.repair');
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
};

export const aiol = {
  async append(input: { buildId?: string; from?: string; to?: string; kind: string; body: Record<string, unknown> }): Promise<void> {
    const admin = await getAdmin();
    const { error } = await admin.from('aiol_messages').insert({
      build_id: input.buildId ?? null, from_agent: input.from ?? null,
      to_agent: input.to ?? null, kind: input.kind, body: input.body,
    });
    if (error) throw new Error(error.message);
  },
};

export const files = {
  async upsert(input: { buildId: string; path: string; content: string; mime: string }): Promise<FileRow> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('build_files').upsert({
      build_id: input.buildId, path: input.path, content: input.content, mime: input.mime,
    }, { onConflict: 'build_id,path' }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  async setEvidence(id: string, status: EvidenceStatus, notes?: string): Promise<void> {
    const admin = await getAdmin();
    const update: Record<string, unknown> = { evidence_status: status, updated_at: new Date().toISOString() };
    if (notes !== undefined) update.evidence_notes = notes;
    const { error } = await admin.from('build_files').update(update).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async byBuild(buildId: string): Promise<FileRow[]> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('build_files').select().eq('build_id', buildId);
    if (error) throw new Error(error.message);
    return data;
  },
  async read(buildId: string, path: string): Promise<FileRow | null> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('build_files').select().eq('build_id', buildId).eq('path', path).single();
    if (error) { if (error.code === 'PGRST116') return null; throw new Error(error.message); }
    return data;
  },
};

export const vault = {
  async write(input: { buildId?: string; pattern: string; evidence: Record<string, unknown>; embedding: number[]; nextUseCase?: string }): Promise<VaultRow> {
    const admin = await getAdmin();
    const { data, error } = await admin.from('vault_entries').insert({
      build_id: input.buildId ?? null, pattern: input.pattern, evidence: input.evidence,
      embedding: input.embedding, next_use_case: input.nextUseCase ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  async searchTop(embedding: number[], k = 5): Promise<Array<VaultRow & { distance: number }>> {
    const admin = await getAdmin();
    const { data, error } = await admin.rpc('vault_search', { query_embedding: embedding, match_count: k });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};
