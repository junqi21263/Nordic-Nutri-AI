import type { SessionStorage } from "../services/auth/types";

export type SecureStorageBridge = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

function globalBridge(): SecureStorageBridge | null {
  const candidate = (globalThis as { NordicSecureStorage?: SecureStorageBridge })
    .NordicSecureStorage;
  if (
    !candidate ||
    typeof candidate.get !== "function" ||
    typeof candidate.set !== "function" ||
    typeof candidate.remove !== "function"
  )
    return null;
  return candidate;
}

export function createSecureTokenStorage(bridge = globalBridge()): SessionStorage | null {
  if (!bridge) return null;
  return {
    getItem: (key) => bridge.get(key),
    setItem: (key, value) => bridge.set(key, value),
    removeItem: (key) => bridge.remove(key),
  };
}
