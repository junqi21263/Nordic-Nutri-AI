import { create } from "zustand";

export type AuthStatus = "unknown" | "authenticated" | "anonymous";

export interface AppAuthUser {
  id: string;
  email?: string | null;
}

export interface AppAuthSession {
  user: AppAuthUser;
  accessToken?: string;
}

export interface AuthState {
  status: AuthStatus;
  session: AppAuthSession | null;
  user: AppAuthUser | null;
  setSession: (session: AppAuthSession | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "unknown",
  session: null,
  user: null,
  setSession: (session) => set({
    status: session ? "authenticated" : "anonymous",
    session,
    user: session?.user ?? null,
  }),
  clear: () => set({ status: "anonymous", session: null, user: null }),
}));
