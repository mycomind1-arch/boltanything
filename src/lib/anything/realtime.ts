import { supabase } from '../supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function subscribeToBuild(buildId: string, onUpdate: (payload: Record<string, unknown>) => void): RealtimeChannel {
  return supabase
    .channel(`build:${buildId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'builds', filter: `id=eq.${buildId}` }, (p) => onUpdate(p.new as Record<string, unknown>))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agents', filter: `build_id=eq.${buildId}` }, (p) => onUpdate({ _table: 'agents', ...p }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `build_id=eq.${buildId}` }, (p) => onUpdate({ _table: 'jobs', ...p }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'build_files', filter: `build_id=eq.${buildId}` }, (p) => onUpdate({ _table: 'build_files', ...p }))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'aiol_messages', filter: `build_id=eq.${buildId}` }, (p) => onUpdate({ _table: 'aiol_messages', ...p }))
    .subscribe();
}

export function unsubscribe(channel: RealtimeChannel) { supabase.removeChannel(channel); }
