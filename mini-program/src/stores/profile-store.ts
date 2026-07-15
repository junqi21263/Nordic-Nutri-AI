import { create } from "zustand";
export interface ProfileSettings {
  theme: "light" | "dark" | "system";
  language: "zh-CN" | "en";
  notification: boolean;
  unit: "metric" | "imperial";
  developerMode: boolean;
}
export interface ProfilePreview {
  nickname: string;
  goalLabel: string;
  weight: number;
  targetWeight: number;
  targetCalories: number;
}
export interface ProfileStore {
  profile: ProfilePreview;
  settings: ProfileSettings;
  setProfile: (profile: Partial<ProfilePreview>) => void;
  setSetting: <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => void;
  reset: () => void;
}
export interface ProfileStorage {
  read: () => Partial<ProfilePreview> | null;
  write: (profile: ProfilePreview) => void;
  clear: () => void;
}
const initialProfile = {
  nickname: "Lewis",
  goalLabel: "精益增肌",
  weight: 70,
  targetWeight: 74,
  targetCalories: 2600,
};
const initialSettings: ProfileSettings = {
  theme: "system",
  language: "zh-CN",
  notification: true,
  unit: "metric",
  developerMode: false,
};
const profileStorageKey = "nordic-nutri:profile:v1";
type NativeStorage = {
  getStorageSync: (key: string) => unknown;
  setStorageSync: (key: string, value: unknown) => void;
  removeStorageSync: (key: string) => void;
};
const nativeStorage = () => (globalThis as { wx?: NativeStorage }).wx;
const taroProfileStorage: ProfileStorage = {
  read: () => {
    try {
      return (
        (nativeStorage()?.getStorageSync(profileStorageKey) as Partial<ProfilePreview>) || null
      );
    } catch {
      return null;
    }
  },
  write: (profile) => {
    try {
      nativeStorage()?.setStorageSync(profileStorageKey, profile);
    } catch {
      // Local persistence is best-effort and never blocks profile edits.
    }
  },
  clear: () => {
    try {
      nativeStorage()?.removeStorageSync(profileStorageKey);
    } catch {
      // Local persistence is best-effort and never blocks profile resets.
    }
  },
};

export const createProfileStore = (storage?: ProfileStorage) => {
  const profile = { ...initialProfile, ...storage?.read() };
  return create<ProfileStore>((set, get) => ({
    profile,
    settings: initialSettings,
    setProfile: (changes) => {
      const nextProfile = { ...get().profile, ...changes };
      storage?.write(nextProfile);
      set({ profile: nextProfile });
    },
    setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
    reset: () => {
      storage?.clear();
      set({ profile: initialProfile, settings: initialSettings });
    },
  }));
};
export const useProfileStore = createProfileStore(taroProfileStorage);
