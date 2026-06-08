import type { BuildStatus, AgentState, AgentRole, EvidenceStatus } from './types';

const statusColors: Record<BuildStatus, string> = { queued: 'bg-slate-500', running: 'bg-blue-500', succeeded: 'bg-emerald-500', failed: 'bg-red-500', deployed_pending: 'bg-amber-500' };
const stateColors: Record<AgentState, string> = { pending: 'bg-slate-500', running: 'bg-blue-500', collapsed: 'bg-slate-600', failed: 'bg-red-500' };
const roleLabels: Record<AgentRole, string> = { root: 'Root', architect: 'Architect', coder: 'Coder', critic: 'Critic', docwright: 'Docwright', librarian: 'Librarian' };
const roleColors: Record<AgentRole, string> = { root: 'text-slate-300', architect: 'text-blue-400', coder: 'text-emerald-400', critic: 'text-amber-400', docwright: 'text-purple-400', librarian: 'text-cyan-400' };
const evidenceColors: Record<EvidenceStatus, string> = { pending: 'bg-slate-500', ok: 'bg-emerald-500', failed: 'bg-red-500' };

export const statusDot = (s: BuildStatus) => statusColors[s] ?? 'bg-slate-500';
export const stateDot = (s: AgentState) => stateColors[s] ?? 'bg-slate-500';
export const roleLabel = (r: AgentRole) => roleLabels[r] ?? r;
export const roleColor = (r: AgentRole) => roleColors[r] ?? 'text-slate-300';
export const evidenceDot = (s: EvidenceStatus) => evidenceColors[s] ?? 'bg-slate-500';

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
