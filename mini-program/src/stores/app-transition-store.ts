import { create } from "zustand";

interface AppTransitionState {
  welcomeTransitionVisible: boolean;
  showWelcomeTransition: () => void;
  hideWelcomeTransition: () => void;
}

export const useAppTransitionStore = create<AppTransitionState>((set) => ({
  welcomeTransitionVisible: false,
  showWelcomeTransition: () => set({ welcomeTransitionVisible: true }),
  hideWelcomeTransition: () => set({ welcomeTransitionVisible: false }),
}));

