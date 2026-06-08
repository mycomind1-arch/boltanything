import type { BuildRow } from '../../lib/anything/types';
import { statusDot, timeAgo } from '../../lib/anything/format';
import { Loader2 } from 'lucide-react';

interface Props { build: BuildRow | null; }

export function BuildHeader({ build }: Props) {
  if (!build) return <div className="h-10 flex items-center px-4 border-b border-slate-800 shrink-0"><span className="text-xs text-slate-500">No build selected</span></div>;
  return (
    <div className="h-10 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${statusDot(build.status)}`} />
        <span className="text-xs font-medium text-slate-300 truncate max-w-[200px]">{build.directive}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        {build.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
        <span>{timeAgo(build.created_at)}</span>
      </div>
    </div>
  );
}
