import { useState } from 'react';
import { Dashboard } from '@/pages';
import { PatientDetailPage } from '@/pages';
import { usePatients } from '@/hooks';
import { demoApi } from '@/api';

export function App() {
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const { data, lastRefresh, connected, error, refetch } = usePatients();

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl font-bold mb-2 text-slate-100">Aasha</div>
          <div className="text-gray-400">
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
    <div className="min-h-screen max-w-3xl mx-auto px-4 py-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Aasha</h1>
          <div className="text-sm text-gray-400">
            Maternal Health Surveillance
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            <div
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-green-500 pulse-ring' : 'bg-red-500'
              }`}
            />
            <span className="text-xs text-gray-400">
              {connected ? 'Live' : 'Disconnected'}
            </span>
          </div>
          {lastRefresh && (
            <div className="text-xs text-gray-500">
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
          className="bg-slate-700 text-gray-400 px-3 py-2 rounded-lg text-xs hover:bg-slate-600"
        >
          Seed Demo Data
        </button>
      </div>
    </div>
  );
}
