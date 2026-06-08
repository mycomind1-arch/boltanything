import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { subscribeToBuild, unsubscribe } from './realtime';
import type { BuildRow, AgentRow, FileRow, AiolRow } from './types';

export interface BuildSnapshot { build: BuildRow | null; agents: AgentRow[]; files: FileRow[]; messages: AiolRow[]; loading: boolean; }

export function useBuildStream(buildId: string | null) {
  const [snapshot, setSnapshot] = useState<BuildSnapshot>({ build: null, agents: [], files: [], messages: [], loading: true });
  const channelRef = useRef<ReturnType<typeof subscribeToBuild> | null>(null);

  const loadSnapshot = useCallback(async () => {
    if (!buildId) return;
    setSnapshot(prev => ({ ...prev, loading: true }));
    const [buildRes, agentsRes, filesRes, messagesRes] = await Promise.all([
      supabase.from('builds').select().eq('id', buildId).single(),
      supabase.from('agents').select().eq('build_id', buildId),
      supabase.from('build_files').select().eq('build_id', buildId),
      supabase.from('aiol_messages').select().eq('build_id', buildId).order('id', { ascending: true }).limit(200),
    ]);
    setSnapshot({ build: buildRes.data, agents: agentsRes.data ?? [], files: filesRes.data ?? [], messages: messagesRes.data ?? [], loading: false });
  }, [buildId]);

  useEffect(() => { loadSnapshot(); }, [loadSnapshot]);

  useEffect(() => {
    if (!buildId) return;
    const channel = subscribeToBuild(buildId, () => { loadSnapshot(); });
    channelRef.current = channel;
    return () => { if (channelRef.current) { unsubscribe(channelRef.current); channelRef.current = null; } };
  }, [buildId, loadSnapshot]);

  return snapshot;
}
