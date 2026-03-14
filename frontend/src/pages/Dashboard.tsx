import { SummaryCards, PatientList } from '@/components/dashboard';
import type { PatientsResponse } from '@/types';

interface DashboardProps {
  data: PatientsResponse;
  onSelectPatient: (id: string) => void;
}

export function Dashboard({ data, onSelectPatient }: DashboardProps) {
  return (
    <>
      <SummaryCards summary={data.summary} />
      <h2 className="text-lg font-semibold mb-3 text-slate-200">
        Patients ({data.summary.total})
      </h2>
      <PatientList patients={data.patients} onSelect={onSelectPatient} />
    </>
  );
}
