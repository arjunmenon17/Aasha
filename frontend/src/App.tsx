import { useState, useEffect } from 'react';
import { Login, Dashboard, PatientDetailPage } from '@/pages';
import { usePatients } from '@/hooks';
import { FloralBackdrop, BrandedLoader } from '@/components/ui';
import { EnrollmentForm } from '@/components/enrollment/EnrollmentForm';
import { authApi } from '@/api';
import { getAuthToken, setAuthToken } from '@/api/client';

export function App() {
  const [entered, setEntered] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const { data, lastRefresh, connected, error, refetch } = usePatients(30_000, entered);

  const handleEnter = (accessToken: string) => {
    setAuthToken(accessToken);
    setEntered(true);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/dashboard');
    }
  };

  const handleLogout = () => {
    setSelectedPatient(null);
    setEntered(false);
    setAuthToken(null);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const token = getAuthToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }
    authApi
      .me()
      .then(() => {
        if (!cancelled) setEntered(true);
      })
      .catch(() => {
        setAuthToken(null);
        if (!cancelled) setEntered(false);
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!entered || !error) return;
    if (error.includes('401')) {
      setAuthToken(null);
      setEntered(false);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/');
      }
    }
  }, [entered, error]);

  // Keep URL path in sync with auth state so endpoints differ:
  // /, /about, /login for public screen, /dashboard for main app.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (entered) {
      if (window.location.pathname !== '/dashboard') {
        window.history.replaceState(null, '', '/dashboard');
      }
      return;
    }
    // Keep public routes stable; default unknown routes to home.
    if (
      window.location.pathname !== '/' &&
      window.location.pathname !== '/about' &&
      window.location.pathname !== '/login'
    ) {
      window.history.replaceState(null, '', '/');
    }
  }, [entered]);

  if (!authChecked) {
    return (
      <div className="min-h-screen relative overflow-hidden app-shell-bg flex items-center justify-center">
        <FloralBackdrop />
        <div className="relative z-10">
          <BrandedLoader message="Checking session..." size="lg" />
        </div>
      </div>
    );
  }

  if (!entered) {
    return <Login onEnter={handleEnter} />;
  }

  if (!data) {
    return (
      <div className="min-h-screen relative overflow-hidden app-shell-bg flex items-center justify-center">
        <FloralBackdrop />
        <div className="relative z-10">
          <BrandedLoader
            message={error ? `Error: ${error}` : 'Connecting to server...'}
            size="lg"
          />
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
