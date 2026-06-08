export type BuildStatus = 'queued'|'running'|'succeeded'|'failed'|'deployed_pending';
export type BuildMode   = 'build'|'repair';
export type AgentState  = 'pending'|'running'|'collapsed'|'failed';
export type AgentRole   = 'root'|'architect'|'coder'|'critic'|'docwright'|'librarian';
export type JobStatus   = 'queued'|'claimed'|'running'|'succeeded'|'failed';
export type EvidenceStatus = 'pending'|'ok'|'failed';

export type AgentCode =
  | 'ORC' | 'ARCH' | 'CODER' | 'QA' | 'DOC' | 'VAULT' | 'N8N' | 'SB' | 'SYS';

export interface BuildRow {
  id: string; owner_id: string; directive: string;
  status: BuildStatus; mode: BuildMode;
  cycle_count: number; auto_cycle: boolean;
  parent_build_id: string|null; meta: Record<string,unknown>;
  created_at: string; updated_at: string;
}

export interface AgentRow {
  id: string; build_id: string; parent_id: string|null;
  role: AgentRole; state: AgentState;
  meta: Record<string,unknown>; created_at: string;
}

export interface JobRow {
  id: string; build_id: string; agent_id: string|null;
  kind: string; payload: Record<string,unknown>;
  status: JobStatus; attempts: number;
  last_error: string|null; claimed_at: string|null; created_at: string;
}

export interface AiolRow {
  id: number; build_id: string|null;
  from_agent: string|null; to_agent: string|null;
  kind: string; body: Record<string,unknown>; created_at: string;
}

export interface FileRow {
  id: string; build_id: string; path: string;
  content: string; mime: string;
  evidence_status: EvidenceStatus; evidence_notes: string|null;
  created_at: string; updated_at: string;
}

export interface VaultRow {
  id: string; build_id: string|null; pattern: string;
  evidence: Record<string,unknown>; next_use_case: string|null;
  embedding: number[]|null; public: boolean; created_at: string;
}

export class GatewayError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class DbError extends Error {
  constructor(public code: string, public hint: string) { super(`DB error: ${code}`) }
}
export class CapError extends Error {
  constructor(public cap: 'depth'|'fanout'|'budget'|'repair'|'cycle') {
    super(`Cap violation: ${cap}`);
  }
}
