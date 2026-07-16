import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";

export type AuthStatus = "unknown" | "authenticated" | "anonymous";

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  setSession: (session: Session | null) => void;
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
