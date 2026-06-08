import { useChat } from '../../lib/anything/use-chat';
import { MessageBubble } from './MessageBubble';
import { Composer } from './Composer';
import { Zap, Loader2 } from 'lucide-react';

interface Props { onStartBuild?: (buildId: string) => void; }

export function ChatPane({ onStartBuild }: Props) {
  const { messages, loading, send } = useChat();

  return (
    <div className="flex flex-col h-full">
      <div className="h-10 flex items-center gap-2 px-4 border-b border-slate-800 shrink-0">
        <Zap className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-medium text-slate-300">Chat</span>
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-10 h-10 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-center mb-3"><Zap className="w-5 h-5 text-slate-500" /></div>
            <p className="text-sm text-slate-400">Describe what you want to build</p>
            <p className="text-xs text-slate-500 mt-1">Anything will decompose, generate, and validate it</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map(msg => <MessageBubble key={msg.id} message={msg} onStartBuild={onStartBuild} />)}
            {loading && <div className="flex items-center gap-2 px-4 py-2"><Loader2 className="w-4 h-4 text-emerald-400 animate-spin" /><span className="text-xs text-slate-400">Starting build...</span></div>}
          </div>
        )}
      </div>
      <Composer onSend={send} loading={loading} />
    </div>
  );
}
