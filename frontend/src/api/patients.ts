import { api } from './client';
import type { PatientsResponse, PatientDetail } from '@/types';

export const patientsApi = {
  list: () => api.get<PatientsResponse>('/api/patients'),
  get: (id: string) => api.get<PatientDetail>(`/api/patients/${id}`),
  resolveEscalation: (id: string) =>
    api.post<unknown>(`/api/patients/${id}/resolve`),
  triggerCheckIn: (id: string) =>
    api.post<unknown>(`/api/check-in/${id}`),
};
