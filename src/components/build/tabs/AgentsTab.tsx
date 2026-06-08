import type { AgentRow } from '../../../lib/anything/types';
import { roleLabel, roleColor, stateDot, timeAgo } from '../../../lib/anything/format';
import { Users } from 'lucide-react';

interface Props { agents: AgentRow[]; }

export function AgentsTab({ agents }: Props) {
  if (agents.length === 0) return <div className="flex items-center justify-center h-full text-center py-8"><div><Users className="w-6 h-6 text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-500">No agents spawned yet</p></div></div>;

  return (
    <div className="overflow-y-auto h-full">
      <div className="divide-y divide-slate-800/50">
        {agents.map(agent => (
          <div key={agent.id} className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${stateDot(agent.state)}`} />
              <span className={`text-xs font-medium ${roleColor(agent.role)}`}>{roleLabel(agent.role)}</span>
              <span className="text-[10px] text-slate-600 font-mono">{agent.id.slice(0, 8)}</span>
            </div>
            <div className="mt-1 ml-4"><span className="text-[10px] text-slate-600">{timeAgo(agent.created_at)}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
