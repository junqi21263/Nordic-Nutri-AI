import { create } from "zustand";
import type { ScannerMealFixture } from "../features/scanner/domain";
export interface AnalysisStore {
  analysis: ScannerMealFixture | null;
  setAnalysis: (analysis: ScannerMealFixture) => void;
  reset: () => void;
}
export const createAnalysisStore = () =>
  create<AnalysisStore>((set) => ({
    analysis: null,
    setAnalysis: (analysis) => set({ analysis }),
    reset: () => set({ analysis: null }),
  }));
export const useAnalysisStore = createAnalysisStore();
