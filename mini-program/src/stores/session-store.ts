import { create } from "zustand";
import type { AuthSession } from "../services/auth/types";

interface SessionStore {
  session: AuthSession | null;
  setSession: (session: AuthSession | null) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  reset: () => set({ session: null }),
}));
