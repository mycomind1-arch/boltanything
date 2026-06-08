import type { VaultRow } from '../../../lib/anything/types';
import { Database } from 'lucide-react';

interface Props { vaultEntries: VaultRow[]; }

export function VaultTab({ vaultEntries }: Props) {
  if (vaultEntries.length === 0) return <div className="flex items-center justify-center h-full text-center py-8"><div><Database className="w-6 h-6 text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-500">No vault entries yet</p></div></div>;

  return (
    <div className="overflow-y-auto h-full">
      <div className="divide-y divide-slate-800/50">
        {vaultEntries.map(entry => (
          <div key={entry.id} className="px-4 py-3">
            <p className="text-xs text-slate-300 leading-relaxed">{entry.pattern}</p>
            {entry.next_use_case && <p className="text-[11px] text-slate-500 mt-1">Next: {entry.next_use_case}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
