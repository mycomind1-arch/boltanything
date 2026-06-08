import type { FileRow } from '../../../lib/anything/types';
import { evidenceDot } from '../../../lib/anything/format';
import { FileCode, FolderOpen } from 'lucide-react';
import { useState } from 'react';

interface Props { files: FileRow[]; }

export function FilesTab({ files }: Props) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  if (files.length === 0) return <div className="flex items-center justify-center h-full text-center py-8"><div><FolderOpen className="w-6 h-6 text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-500">No files generated yet</p></div></div>;

  const selected = files.find(f => f.path === selectedFile);

  return (
    <div className="flex h-full">
      <div className="w-52 border-r border-slate-800 overflow-y-auto shrink-0">
        {files.map(file => (
          <button key={file.id} onClick={() => setSelectedFile(file.path)} className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs hover:bg-slate-800/50 transition-colors ${selectedFile === file.path ? 'bg-slate-800/80 text-white' : 'text-slate-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${evidenceDot(file.evidence_status)}`} />
            <span className="truncate">{file.path}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {selected ? (
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileCode className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-mono text-slate-300">{selected.path}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${selected.evidence_status === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : selected.evidence_status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-slate-700/50 text-slate-400'}`}>{selected.evidence_status}</span>
            </div>
            <pre className="text-[11px] font-mono leading-relaxed text-slate-300 bg-slate-900/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{selected.content}</pre>
          </div>
        ) : <div className="flex items-center justify-center h-full"><p className="text-xs text-slate-500">Select a file to view</p></div>}
      </div>
    </div>
  );
}
