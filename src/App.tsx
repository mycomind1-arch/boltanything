import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthPage } from './routes/auth/AuthPage';
import { AuthenticatedLayout } from './routes/_authenticated/AuthenticatedLayout';
import { useAuth } from './lib/auth/use-auth';
import { isOwner } from './lib/auth/owner-guard';
import { Loader2 } from 'lucide-react';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>;
  if (!user || !isOwner(user.email)) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<AuthGuard><AuthenticatedLayout /></AuthGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
