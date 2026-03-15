import { useState, useEffect } from 'react';
import { Login, Dashboard, PatientDetailPage } from '@/pages';
import { usePatients } from '@/hooks';
import { FloralBackdrop } from '@/components/ui';
import { EnrollmentForm } from '@/components/enrollment/EnrollmentForm';

export function App() {
  const [entered, setEntered] = useState(() => {
    if (typeof window === 'undefined') return false;
    // First load should default to /login. Only /dashboard opens dashboard directly.
    if (window.location.pathname === '/dashboard') return true;
    return false;
  });
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const { data, lastRefresh, connected, error, refetch } = usePatients();

  const handleEnter = () => {
    setEntered(true);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/dashboard');
    }
  };

  const handleLogout = () => {
    setSelectedPatient(null);
    setEntered(false);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/login');
    }
  };

  // Keep URL path in sync with auth state so endpoints differ:
  // /login for login screen, /dashboard for main app.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = entered ? '/dashboard' : '/login';
    if (window.location.pathname !== target) {
      window.history.replaceState(null, '', target);
    }
  }, [entered]);

  if (!entered) {
    return <Login onEnter={handleEnter} />;
  }

  if (!data) {
    return (
      <div className="min-h-screen relative overflow-hidden app-shell-bg flex items-center justify-center">
        <FloralBackdrop />
        <div className="text-center relative z-10">
          <div className="text-3xl font-bold mb-2 text-slate-900">Aasha</div>
          <div className="text-slate-500">
            {error ? `Error: ${error}` : 'Connecting to server...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden app-shell-bg flex flex-col">
      <FloralBackdrop />
      <header className="flex items-center justify-between w-full rounded-t-xl border-b border-slate-200/80 bg-white/90 backdrop-blur-sm pl-6 sm:pl-8 pr-4 sm:pr-6 py-3 shadow-sm relative z-10 shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="/aasha.png"
            alt="Aasha"
            className="h-10 w-auto object-contain drop-shadow-sm"
          />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-[0.16em] uppercase text-slate-900">
              AASHA
            </h1>
            <div className="text-xs sm:text-sm text-slate-500 uppercase tracking-[0.18em]">
              Equal Care for All
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium ${
                connected
                  ? 'bg-emerald-50/80 text-emerald-700'
                  : 'bg-red-50/80 text-red-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  connected ? 'bg-emerald-500 pulse-ring' : 'bg-red-500'
                }`}
              />
              <span>{connected ? 'Live' : 'Disconnected'}</span>
            </div>
            {lastRefresh && (
              <div className="text-xs text-slate-400 hidden sm:block">
                Updated {lastRefresh.toLocaleTimeString()}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEnrolling(true)}
            className="text-xs px-3 py-1.5 rounded-full bg-[#B85050] text-white hover:bg-[#9A4040] transition"
          >
            Enroll Patient
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm font-medium px-3 py-1.5 rounded-full text-slate-800 hover:bg-slate-200"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 relative z-10 w-full flex-1 min-h-0">
        {enrolling ? (
          <EnrollmentForm
            onSuccess={() => { setEnrolling(false); refetch(); }}
            onCancel={() => setEnrolling(false)}
          />
        ) : selectedPatient ? (
          <PatientDetailPage
            patientId={selectedPatient}
            onBack={() => setSelectedPatient(null)}
            onResolved={() => {
              setSelectedPatient(null);
              refetch();
            }}
          />
        ) : (
          <Dashboard data={data} onSelectPatient={setSelectedPatient} />
        )}
      </div>
    </div>
  );
}
