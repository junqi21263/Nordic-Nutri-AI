import { create } from "zustand";
import {
  createScannerFixtures,
  pickScannerCandidates,
  type ScannerMealFixture,
} from "../features/scanner/domain";

export interface ScannerStore {
  candidates: ScannerMealFixture[];
  capturedMeal: ScannerMealFixture | null;
  flashEnabled: boolean;
  galleryMode: boolean;
  previewPath: string | null;
  resultRevealPending: boolean;
  setCandidates: (candidates: ScannerMealFixture[]) => void;
  captureRandom: () => ScannerMealFixture;
  setCapturedMeal: (meal: ScannerMealFixture) => void;
  setPreviewPath: (previewPath: string | null) => void;
  markResultRevealPending: () => void;
  consumeResultRevealPending: () => boolean;
  clearResultRevealPending: () => void;
  setGalleryMode: (galleryMode: boolean) => void;
  toggleFlash: () => void;
  toggleGallery: () => void;
  reset: () => void;
}
export function createScannerStore(fixtures = createScannerFixtures()) {
  return create<ScannerStore>((set, get) => ({
    candidates: pickScannerCandidates(fixtures),
    capturedMeal: null,
    flashEnabled: false,
    galleryMode: false,
    previewPath: null,
    resultRevealPending: false,
    setCandidates: (candidates) => set({ candidates }),
    captureRandom: () => {
      const candidates = get().candidates.length
        ? get().candidates
        : pickScannerCandidates(fixtures);
      const meal = candidates[Math.floor(Math.random() * candidates.length)]!;
      set({ capturedMeal: meal });
      return meal;
    },
    setCapturedMeal: (capturedMeal) => set({ capturedMeal }),
    setPreviewPath: (previewPath) => set({ previewPath }),
    markResultRevealPending: () => set({ resultRevealPending: true }),
    consumeResultRevealPending: () => {
      const resultRevealPending = get().resultRevealPending;
      set({ resultRevealPending: false });
      return resultRevealPending;
    },
    clearResultRevealPending: () => set({ resultRevealPending: false }),
    setGalleryMode: (galleryMode) => set({ galleryMode }),
    toggleFlash: () => set((state) => ({ flashEnabled: !state.flashEnabled })),
    toggleGallery: () => set((state) => ({ galleryMode: !state.galleryMode })),
    reset: () =>
      set({
        candidates: pickScannerCandidates(fixtures),
        capturedMeal: null,
        flashEnabled: false,
        galleryMode: false,
        previewPath: null,
        resultRevealPending: false,
      }),
  }));
}
export const useScannerStore = createScannerStore();
