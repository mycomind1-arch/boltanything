import type { AgentRole, JobRow } from '../types';

type WorkflowSlug = 'decompose' | 'generate_files' | 'evidence_gate' | 'repair' | 'docs_and_tests' | 'vault_write' | 'vault_search_rerank';

export type JobKind = 'root.start' | 'vault.search' | 'architect.decompose' | 'coder.generate' | 'critic.gate' | 'coder.repair' | 'docs.write' | 'librarian.vault';

export interface Route { spawnRole: AgentRole | null; workflow: WorkflowSlug | null; buildPayload: (job: JobRow, ctx: TickCtx) => Promise<Record<string, unknown>>; }
export interface TickCtx { buildId: string; parentAgentId: string | null; }

const rootStartPayload = async (job: JobRow) => ({ directive: job.payload.directive ?? job.kind });
const vaultSearchPayload = async (job: JobRow) => ({ directive: job.payload.directive });
const decomposePayload = async (job: JobRow) => ({ directive: job.payload.directive, vault_hits: job.payload.vault_hits ?? [] });
const generatePayload = async (job: JobRow) => ({ capability: job.payload.capability ?? {}, files_context: job.payload.files_context ?? [], vault_hits: job.payload.vault_hits ?? [] });
const gatePayload = async (job: JobRow) => ({ files: job.payload.files ?? [] });
const repairPayload = async (job: JobRow) => ({ capability: job.payload.capability ?? {}, failed_files: job.payload.failed_files ?? [] });
const docsPayload = async (job: JobRow) => ({ files: job.payload.files ?? [], directive: job.payload.directive ?? '' });
const vaultWritePayload = async (job: JobRow) => ({ directive: job.payload.directive ?? '', files_summary: job.payload.files_summary ?? [], embedding: job.payload.embedding ?? [] });

export const ROUTES: Record<JobKind, Route> = {
  'root.start':          { spawnRole: 'root',       workflow: null,                   buildPayload: rootStartPayload },
  'vault.search':        { spawnRole: 'librarian',  workflow: 'vault_search_rerank',  buildPayload: vaultSearchPayload },
  'architect.decompose': { spawnRole: 'architect',  workflow: 'decompose',            buildPayload: decomposePayload },
  'coder.generate':      { spawnRole: 'coder',      workflow: 'generate_files',       buildPayload: generatePayload },
  'critic.gate':         { spawnRole: 'critic',     workflow: 'evidence_gate',        buildPayload: gatePayload },
  'coder.repair':        { spawnRole: null,          workflow: 'repair',              buildPayload: repairPayload },
  'docs.write':          { spawnRole: 'docwright',  workflow: 'docs_and_tests',       buildPayload: docsPayload },
  'librarian.vault':     { spawnRole: 'librarian',  workflow: 'vault_write',          buildPayload: vaultWritePayload },
};
