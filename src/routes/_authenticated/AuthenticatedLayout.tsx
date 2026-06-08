import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ChatPane } from '../../components/chat/ChatPane';
import { BuildPanel } from '../../components/build/BuildPanel';
import { Zap, LogOut } from 'lucide-react';

export function AuthenticatedLayout() {
  const [activeBuildId, setActiveBuildId] = useState<string | null>(null);

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-white">
      <header className="h-11 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2"><Zap className="w-5 h-5 text-emerald-400" /><span className="font-semibold text-sm tracking-tight">Anything</span></div>
        <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"><LogOut className="w-3.5 h-3.5" />Sign out</button>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-[360px] border-r border-slate-800 flex flex-col shrink-0"><ChatPane onStartBuild={setActiveBuildId} /></div>
        <div className="flex-1 flex flex-col min-w-0"><BuildPanel buildId={activeBuildId} /></div>
      </div>
    </div>
  );
}
