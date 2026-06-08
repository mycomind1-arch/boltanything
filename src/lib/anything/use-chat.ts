import { useState, useCallback } from 'react';
import { supabase } from '../supabase';

export interface ChatMessage { id: string; role: 'user' | 'assistant' | 'system'; content: string; buildId?: string; ts: number; }

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const send = useCallback(async (directive: string) => {
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: directive, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ directive }),
      });
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `Build started: ${data.buildId}`, buildId: data.buildId, ts: Date.now() }]);
      return data.buildId as string | undefined;
    } catch (err) {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'system', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, ts: Date.now() }]);
      return undefined;
    } finally { setLoading(false); }
  }, []);

  return { messages, loading, send };
}
