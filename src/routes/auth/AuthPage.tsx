import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isOwner } from '../../lib/auth/owner-guard';
import { Zap, Shield, AlertTriangle } from 'lucide-react';

export function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [restricted, setRestricted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRestricted(false);
    setLoading(true);
    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      if (!isOwner(email)) { setRestricted(true); await supabase.auth.signOut(); }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Authentication failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4"><Zap className="w-8 h-8 text-emerald-400" /></div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Anything</h1>
          <p className="text-slate-400 mt-2 text-sm">Self-improving vibe-coding platform</p>
        </div>
        {restricted && <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3"><Shield className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" /><div><p className="text-amber-200 font-medium text-sm">Access restricted</p><p className="text-amber-200/60 text-xs mt-1">This platform is single-owner only.</p></div></div>}
        {error && <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" /><p className="text-red-200 text-sm">{error}</p></div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">Email</label><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm" placeholder="you@example.com" /></div>
          <div><label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">Password</label><input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm" placeholder="Min 6 characters" /></div>
          <button type="submit" disabled={loading} className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-semibold text-sm transition-colors">{loading ? 'Loading...' : isSignUp ? 'Create account' : 'Sign in'}</button>
        </form>
        <p className="text-center mt-4 text-sm text-slate-500">{isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}<button onClick={() => setIsSignUp(!isSignUp)} className="text-emerald-400 hover:text-emerald-300 transition-colors">{isSignUp ? 'Sign in' : 'Create one'}</button></p>
      </div>
    </div>
  );
}
