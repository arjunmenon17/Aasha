import { useState, useCallback, useEffect } from 'react';
import { patientsApi } from '@/api';
import type { PatientsResponse } from '@/types';

export function usePatients(pollIntervalMs = 30_000, enabled = true) {
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
        setConnected(false);
        setError(e.message);
      });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchPatients();
    const interval = setInterval(fetchPatients, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchPatients, pollIntervalMs, enabled]);

  return { data, lastRefresh, connected, error, refetch: fetchPatients };
}
