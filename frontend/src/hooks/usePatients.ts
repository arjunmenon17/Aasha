import { useState, useCallback, useEffect } from 'react';
import { patientsApi } from '@/api';
import type { PatientsResponse } from '@/types';
import { MOCK_PATIENTS_RESPONSE } from '@/mock/patients';

export function usePatients(pollIntervalMs = 30_000) {
  const [data, setData] = useState<PatientsResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = useCallback(() => {
    patientsApi
      .list()
      .then((d) => {
        setData(d);
        setLastRefresh(new Date());
        setConnected(true);
        setError(null);
      })
      .catch((e: Error) => {
        // Fallback to mock data so the UI remains usable when the
        // real backend / Supabase is unavailable.
        if (!data) {
          setData(MOCK_PATIENTS_RESPONSE);
          setLastRefresh(new Date());
        }
        setConnected(false);
        setError(e.message);
      });
  }, [data]);

  useEffect(() => {
    fetchPatients();
    const interval = setInterval(fetchPatients, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchPatients, pollIntervalMs]);

  return { data, lastRefresh, connected, error, refetch: fetchPatients };
}
