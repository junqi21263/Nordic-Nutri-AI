import { describe, expect, it, vi, beforeEach } from "vitest";

const storage = new Map<string, unknown>();

vi.mock("@tarojs/taro", () => ({
  default: {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => {
      storage.set(key, value);
    },
  },
}));

import {
  clearOnboardingCompleted,
  isOnboardingCompleted,
  markOnboardingCompleted,
  resetOnboardingCompletionMemory,
  syncOnboardingCompletedFromAccount,
  syncOnboardingCompletedFromServer,
} from "../src/utils/local-experience";

describe("local experience onboarding flag", () => {
  beforeEach(() => {
    storage.clear();
    resetOnboardingCompletionMemory();
  });

  it("marks and clears the local onboarding completed flag", () => {
    markOnboardingCompleted();
    expect(isOnboardingCompleted()).toBe(true);
    clearOnboardingCompleted();
    expect(isOnboardingCompleted()).toBe(false);
  });

  it("syncs from the server onboardingRequired flag after login", () => {
    markOnboardingCompleted();
    syncOnboardingCompletedFromServer(true);
    expect(isOnboardingCompleted()).toBe(false);
    syncOnboardingCompletedFromServer(false);
    expect(isOnboardingCompleted()).toBe(true);
  });

  it("does not mark onboarding complete when the server flag is missing", () => {
    markOnboardingCompleted();
    syncOnboardingCompletedFromServer(undefined);
    expect(isOnboardingCompleted()).toBe(false);
  });

  it("syncs from the account onboardingCompleted field during identity load", () => {
    markOnboardingCompleted();
    syncOnboardingCompletedFromAccount(false);
    expect(isOnboardingCompleted()).toBe(false);
    syncOnboardingCompletedFromAccount(true);
    expect(isOnboardingCompleted()).toBe(true);
  });

  it("does not trust a stale storage flag before server sync", () => {
    storage.set("nordic-nutri:experience:v1", { onboardingCompleted: true });
    expect(isOnboardingCompleted()).toBe(false);
  });

  it("prefers the in-memory sync over a stale storage flag", () => {
    markOnboardingCompleted();
    syncOnboardingCompletedFromAccount(false);
    storage.set("nordic-nutri:experience:v1", { onboardingCompleted: true });
    expect(isOnboardingCompleted()).toBe(false);
  });
});
