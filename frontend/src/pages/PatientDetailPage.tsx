import { PatientDetail } from '@/components/patient';
import { usePatientDetail } from '@/hooks';

interface PatientDetailPageProps {
  patientId: string;
  onBack: () => void;
  onResolved: () => void;
}

export function PatientDetailPage({
  patientId,
  onBack,
  onResolved,
}: PatientDetailPageProps) {
  const { detail, loading, error } = usePatientDetail(patientId);

  return (
    <PatientDetail
      patientId={patientId}
      detail={detail}
      loading={loading}
      error={error}
      onBack={onBack}
      onResolved={onResolved}
    />
  );
}
