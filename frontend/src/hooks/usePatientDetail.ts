import { useState, useEffect } from 'react';
import { patientsApi } from '@/api';
import type { PatientDetail } from '@/types';
import { MOCK_PATIENT_DETAIL_BY_ID } from '@/mock/patients';

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
        // Fallback to mock detail if backend is unavailable.
        const mock = MOCK_PATIENT_DETAIL_BY_ID[patientId];
        if (mock) {
          setDetail(mock);
          setError(null);
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  return { detail, loading, error };
}
