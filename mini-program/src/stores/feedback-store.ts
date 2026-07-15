import { create } from "zustand";

export type FeedbackTone = "default" | "success" | "error";

export interface FeedbackMessage {
  message: string;
  tone?: FeedbackTone;
}

export interface FeedbackStore {
  toast: Required<FeedbackMessage> | null;
  show: (feedback: FeedbackMessage) => void;
  clear: () => void;
}

export const createFeedbackStore = () =>
  create<FeedbackStore>((set) => ({
    toast: null,
    show: ({ message, tone = "default" }) => set({ toast: { message, tone } }),
    clear: () => set({ toast: null }),
  }));

export const useFeedbackStore = createFeedbackStore();
