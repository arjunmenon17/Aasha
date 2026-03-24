import { api } from './client';
import type { LoginResponse, AuthUser } from '@/types';

export const authApi = {
  login: (username: string, password: string) =>
    api.post<LoginResponse>('/api/auth/login', { username, password }),
  demoLogin: () =>
    api.post<LoginResponse>('/api/auth/demo-login', {}),
  me: () => api.get<AuthUser>('/api/auth/me'),
};

