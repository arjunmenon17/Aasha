export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
  role: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: AuthUser;
}

