import type { ChatMessage } from '../../lib/anything/use-chat';
import { Bot, User, AlertTriangle } from 'lucide-react';

interface Props { message: ChatMessage; onStartBuild?: (buildId: string) => void; }

export function MessageBubble({ message, onStartBuild }: Props) {
  const isUser = message.role === 'user';
  const isError = message.role === 'system';

  return (
    <div className="flex gap-2.5 px-4 py-2">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isUser ? 'bg-slate-700' : isError ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
        {isUser ? <User className="w-3.5 h-3.5 text-slate-400" /> : isError ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> : <Bot className="w-3.5 h-3.5 text-emerald-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed ${isUser ? 'text-slate-200' : isError ? 'text-red-300' : 'text-slate-300'}`}>{message.content}</p>
        {message.buildId && onStartBuild && (
          <button onClick={() => onStartBuild(message.buildId!)} className="mt-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">View build</button>
        )}
      </div>
    </div>
  );
}
