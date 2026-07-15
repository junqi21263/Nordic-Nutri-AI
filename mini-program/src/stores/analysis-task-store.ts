import { create } from "zustand";

export type AnalysisTaskStatus = "idle" | "preparing" | "pending" | "failed" | "completed";
interface AnalysisTaskStore {
  status: AnalysisTaskStatus;
  taskId: string | null;
  setTask: (status: AnalysisTaskStatus, taskId?: string | null) => void;
  reset: () => void;
}

export const useAnalysisTaskStore = create<AnalysisTaskStore>((set) => ({
  status: "idle",
  taskId: null,
  setTask: (status, taskId = null) => set({ status, taskId }),
  reset: () => set({ status: "idle", taskId: null }),
}));
