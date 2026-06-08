import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface Props { onSend: (directive: string) => void; loading: boolean; }

export function Composer({ onSend, loading }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!loading) inputRef.current?.focus(); }, [loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800">
      <div className="flex gap-2 items-end">
        <textarea ref={inputRef} value={value} onChange={e => setValue(e.target.value)} onKeyDown={handleKeyDown} placeholder="Describe what you want to build..." rows={1}
          className="flex-1 resize-none rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40" />
        <button type="submit" disabled={loading || !value.trim()} className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0">
          <Send className="w-4 h-4 text-slate-950" />
        </button>
      </div>
    </form>
  );
}
