export interface AuthUser {
  id: string;
  email?: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  user: AuthUser;
}

export interface AuthResult {
  session: AuthSession | null;
  user: AuthUser | null;
}

export interface AuthClient {
  signUp(input: { email: string; password: string }): Promise<AuthResult>;
  signInWithPassword(input: { email: string; password: string }): Promise<AuthResult>;
  getSession(): Promise<AuthSession | null>;
  refreshSession(): Promise<AuthSession | null>;
  getUser(): Promise<AuthUser | null>;
  signOut(): Promise<void>;
}

export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
