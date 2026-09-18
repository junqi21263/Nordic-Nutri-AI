import { create } from "zustand";
import type {
  RecognitionFeedbackType,
  RecognitionResultSnapshot,
} from "../features/recognition-feedback/domain";

export type RecognitionSelectionMode = "replace" | "add" | null;

export interface RecognitionFeedbackStore {
  feedbackId: string | null;
  analysisId: string | null;
  mealId: string | null;
  feedbackType: RecognitionFeedbackType | null;
  originalResult: RecognitionResultSnapshot | null;
  correctedResult: RecognitionResultSnapshot | null;
  pendingNote: string | null;
  replacementItemId: string | null;
  selectedQuantityG: number | null;
  selectionMode: RecognitionSelectionMode;
  start: (context: {
    feedbackId?: string | null;
    analysisId?: string | null;
    mealId?: string | null;
    feedbackType: RecognitionFeedbackType;
    originalResult: RecognitionResultSnapshot;
  }) => void;
  setFeedbackId: (feedbackId: string | null) => void;
  setMealId: (mealId: string | null) => void;
  setCorrectedResult: (correctedResult: RecognitionResultSnapshot | null) => void;
  setPendingNote: (pendingNote: string | null) => void;
  setReplacementItemId: (replacementItemId: string | null) => void;
  setSelectedQuantityG: (selectedQuantityG: number | null) => void;
  setSelectionMode: (selectionMode: RecognitionSelectionMode) => void;
  reset: () => void;
}

export const createRecognitionFeedbackStore = () =>
  create<RecognitionFeedbackStore>((set) => ({
    feedbackId: null,
    analysisId: null,
    mealId: null,
    feedbackType: null,
    originalResult: null,
    correctedResult: null,
    pendingNote: null,
    replacementItemId: null,
    selectedQuantityG: null,
    selectionMode: null,
    start: ({
      feedbackId = null,
      analysisId = null,
      mealId = null,
      feedbackType,
      originalResult,
    }) =>
      set({
        feedbackId,
        analysisId,
        mealId,
        feedbackType,
        originalResult,
        correctedResult: null,
        pendingNote: null,
        replacementItemId: null,
        selectedQuantityG: null,
        selectionMode: null,
      }),
    setFeedbackId: (feedbackId) => set({ feedbackId }),
    setMealId: (mealId) => set({ mealId }),
    setCorrectedResult: (correctedResult) => set({ correctedResult }),
    setPendingNote: (pendingNote) => set({ pendingNote }),
    setReplacementItemId: (replacementItemId) => set({ replacementItemId }),
    setSelectedQuantityG: (selectedQuantityG) => set({ selectedQuantityG }),
    setSelectionMode: (selectionMode) => set({ selectionMode }),
    reset: () =>
      set({
        feedbackId: null,
        analysisId: null,
        mealId: null,
        feedbackType: null,
        originalResult: null,
        correctedResult: null,
        pendingNote: null,
        replacementItemId: null,
        selectedQuantityG: null,
        selectionMode: null,
      }),
  }));

export const useRecognitionFeedbackStore = createRecognitionFeedbackStore();
