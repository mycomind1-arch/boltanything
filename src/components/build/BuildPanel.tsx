import { useState } from 'react';
import { useBuildStream } from '../../lib/anything/use-build-stream';
import { BuildHeader } from './BuildHeader';
import { ActivityTab } from './tabs/ActivityTab';
import { AgentsTab } from './tabs/AgentsTab';
import { FilesTab } from './tabs/FilesTab';
import { PreviewTab } from './tabs/PreviewTab';
import { VaultTab } from './tabs/VaultTab';
import { Activity, Users, FileCode, Globe, Database } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { VaultRow } from '../../lib/anything/types';

type TabId = 'activity' | 'agents' | 'files' | 'preview' | 'vault';
const tabs: Array<{ id: TabId; label: string; icon: typeof Activity }> = [
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'agents', label: 'Agents', icon: Users },
  { id: 'files', label: 'Files', icon: FileCode },
  { id: 'preview', label: 'Preview', icon: Globe },
  { id: 'vault', label: 'Vault', icon: Database },
];

interface Props { buildId: string | null; }

export function BuildPanel({ buildId }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('activity');
  const [vaultEntries, setVaultEntries] = useState<VaultRow[]>([]);
  const snapshot = useBuildStream(buildId);

  if (snapshot.build?.status === 'succeeded' && buildId && vaultEntries.length === 0) {
    supabase.from('vault_entries').select().eq('build_id', buildId).then(({ data }) => { if (data) setVaultEntries(data as VaultRow[]); });
  }

  if (!buildId) return <div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-12 h-12 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-center mx-auto mb-3"><Activity className="w-6 h-6 text-slate-500" /></div><h3 className="text-sm font-medium text-slate-300">Build Panel</h3><p className="text-xs text-slate-500 mt-1">Start a build from chat to see activity</p></div></div>;

  if (snapshot.loading) return <div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto" /><p className="text-xs text-slate-400 mt-3">Loading build...</p></div></div>;

  return (
    <div className="flex flex-col h-full">
      <BuildHeader build={snapshot.build} />
      <div className="flex border-b border-slate-800 shrink-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors ${activeTab === tab.id ? 'text-emerald-400 border-b border-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
            {tab.id === 'files' && snapshot.files.length > 0 && <span className="ml-0.5 px-1 py-0.5 rounded bg-slate-700/50 text-[10px] text-slate-400">{snapshot.files.length}</span>}
            {tab.id === 'agents' && snapshot.agents.length > 0 && <span className="ml-0.5 px-1 py-0.5 rounded bg-slate-700/50 text-[10px] text-slate-400">{snapshot.agents.length}</span>}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'activity' && <ActivityTab messages={snapshot.messages} />}
        {activeTab === 'agents' && <AgentsTab agents={snapshot.agents} />}
        {activeTab === 'files' && <FilesTab files={snapshot.files} />}
        {activeTab === 'preview' && <PreviewTab />}
        {activeTab === 'vault' && <VaultTab vaultEntries={vaultEntries} />}
      </div>
    </div>
  );
}
