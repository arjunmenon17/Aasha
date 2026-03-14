import { useState, useEffect } from 'react';
import { patientsApi } from '@/api';
import type { PatientDetail } from '@/types';

export function usePatientDetail(patientId: string | null) {
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    patientsApi
      .get(patientId)
      .then(setDetail)
      .catch((e: Error) => {
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  return { detail, loading, error };
}
