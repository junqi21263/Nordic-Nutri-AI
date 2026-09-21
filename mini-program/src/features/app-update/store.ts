import { create } from "zustand";
import type { AndroidRelease } from "./types";

export type AppUpdatePhase = "idle" | "downloading" | "verified" | "permission_required" | "installing" | "failed";

interface AppUpdateState {
  release: AndroidRelease | null;
  phase: AppUpdatePhase;
  progress: number;
  show: (release: AndroidRelease) => void;
  dismiss: () => void;
  setProgress: (phase: AppUpdatePhase, progress?: number) => void;
}

export const useAppUpdateStore = create<AppUpdateState>((set) => ({
  release: null,
  phase: "idle",
  progress: 0,
  show: (release) => set({ release, phase: "idle", progress: 0 }),
  dismiss: () => set({ release: null, phase: "idle", progress: 0 }),
  setProgress: (phase, progress = 0) => set({ phase, progress }),
}));
