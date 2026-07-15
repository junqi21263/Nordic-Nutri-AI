import { create } from "zustand";
import {
  createInitialOnboardingDraft,
  type FieldErrors,
  type OnboardingDraft,
  type OnboardingField,
} from "../features/onboarding/domain";

export interface OnboardingDraftStorage {
  read: () => Partial<OnboardingDraft> | null;
  write: (draft: OnboardingDraft) => void;
  clear: () => void;
}

export interface OnboardingDraftStore {
  draft: OnboardingDraft;
  errors: FieldErrors;
  setField: <Field extends OnboardingField>(field: Field, value: OnboardingDraft[Field]) => void;
  setDraft: (draft: Partial<OnboardingDraft>) => void;
  setErrors: (errors: FieldErrors) => void;
  clearFieldError: (field: OnboardingField) => void;
  reset: () => void;
}

export function createOnboardingDraftStore(storage?: OnboardingDraftStorage) {
  const persistedDraft = storage?.read();
  const initialDraft = { ...createInitialOnboardingDraft(), ...persistedDraft };

  return create<OnboardingDraftStore>((set, get) => ({
    draft: initialDraft,
    errors: {},
    setField: (field, value) => {
      const draft = { ...get().draft, [field]: value } as OnboardingDraft;
      storage?.write(draft);
      set((state) => {
        const remainingErrors = { ...state.errors };
        delete remainingErrors[field];
        return { draft, errors: remainingErrors };
      });
    },
    setDraft: (partialDraft) => {
      const draft = { ...get().draft, ...partialDraft };
      storage?.write(draft);
      set({ draft });
    },
    setErrors: (errors) => set({ errors }),
    clearFieldError: (field) =>
      set((state) => {
        const remainingErrors = { ...state.errors };
        delete remainingErrors[field];
        return { errors: remainingErrors };
      }),
    reset: () => {
      storage?.clear();
      set({ draft: createInitialOnboardingDraft(), errors: {} });
    },
  }));
}
