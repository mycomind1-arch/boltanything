import type { AiolRow } from '../../../lib/anything/types';
import { timeAgo } from '../../../lib/anything/format';
import { Activity } from 'lucide-react';

interface Props { messages: AiolRow[]; }

const kindColors: Record<string, string> = { plan: 'text-blue-400', spawn: 'text-purple-400', task: 'text-emerald-400', evidence: 'text-amber-400', repair: 'text-orange-400', vault: 'text-cyan-400', collapse: 'text-slate-400', log: 'text-slate-500' };

export function ActivityTab({ messages }: Props) {
  if (messages.length === 0) return <div className="flex items-center justify-center h-full text-center py-8"><div><Activity className="w-6 h-6 text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-500">No activity yet</p></div></div>;

  return (
    <div className="overflow-y-auto h-full">
      <div className="divide-y divide-slate-800/50">
        {messages.map(msg => (
          <div key={msg.id} className="px-4 py-2 flex items-start gap-3">
            <span className={`text-[10px] font-mono mt-0.5 ${kindColors[msg.kind] ?? 'text-slate-500'}`}>{msg.kind.toUpperCase()}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400">{msg.from_agent ?? '—'}</span>
                <span className="text-slate-600">&rarr;</span>
                <span className="text-slate-400">{msg.to_agent ?? '—'}</span>
              </div>
              {msg.kind === 'log' && typeof msg.body.message === 'string' ? (
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">{msg.body.message}</p>
              ) : null}
            </div>
            <span className="text-[10px] text-slate-600 shrink-0">{timeAgo(msg.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
