import { useState } from 'react';
import { Login, Dashboard, PatientDetailPage } from '@/pages';
import { usePatients } from '@/hooks';
import { demoApi } from '@/api';

export function App() {
  const [entered, setEntered] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const { data, lastRefresh, connected, error, refetch } = usePatients();

  if (!entered) {
    return <Login onEnter={() => setEntered(true)} />;
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-3xl font-bold mb-2 text-slate-900">Aasha</div>
          <div className="text-slate-500">
            {error ? `Error: ${error}` : 'Connecting to server...'}
          </div>
        </div>
      </div>
    );
  }

  const handleSeedDemo = () => {
    if (confirm('Seed demo data? This will add test patients.')) {
      demoApi.seed().then(refetch);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <img
              src="/aasha.png"
              alt="Aasha"
              className="h-10 w-auto object-contain drop-shadow-sm"
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-[0.16em] uppercase text-slate-900">
                AASHA
              </h1>
              <div className="text-xs sm:text-sm text-slate-500 uppercase tracking-[0.18em]">
                Obstetric Monitoring for Clinicians
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              <div
                className={`w-2 h-2 rounded-full ${
                  connected ? 'bg-green-500 pulse-ring' : 'bg-red-500'
                }`}
              />
              <span className="text-xs text-slate-500">
                {connected ? 'Live' : 'Disconnected'}
              </span>
            </div>
            {lastRefresh && (
              <div className="text-xs text-slate-400">
                Updated {lastRefresh.toLocaleTimeString()}
              </div>
            )}
          </div>
        </header>

        {selectedPatient ? (
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

        <div className="fixed bottom-4 right-4">
          <button
            onClick={handleSeedDemo}
            className="bg-slate-800 text-slate-100 px-3 py-2 rounded-lg text-xs hover:bg-slate-900 shadow-md"
          >
            Seed Demo Data
          </button>
        </div>
      </div>
    </div>
  );
}
