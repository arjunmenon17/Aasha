import { api } from './client';

export const demoApi = {
  seed: () => api.post<unknown>('/api/demo/seed'),
};
