import { create } from "zustand";
export interface ProfileSettings {
  dietaryPattern: string | null;
  foodAvoidances: string[];
  mealsPerDay: number;
  theme: "light" | "dark" | "system";
  language: "zh-CN" | "en";
  notification: boolean;
  unit: "metric" | "imperial";
  developerMode: boolean;
}
export interface ProfilePreview {
  nickname: string;
  avatarUrl: string | null;
  goalLabel: string;
  weight: number;
  targetWeight: number;
  targetCalories: number;
}
export interface ProfileStore {
  userId: string | null;
  dataStatus: "idle" | "loading" | "ready" | "error";
  profile: ProfilePreview;
  settings: ProfileSettings;
  beginUser: (userId: string) => void;
  hydrate: (
    userId: string,
    profile: Partial<ProfilePreview>,
    settings: Partial<ProfileSettings>,
  ) => void;
  resetUserData: () => void;
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
  avatarUrl: null,
  goalLabel: "精益增肌",
  weight: 70,
  targetWeight: 74,
  targetCalories: 2600,
};
const initialSettings: ProfileSettings = {
  dietaryPattern: null,
  foodAvoidances: [],
  mealsPerDay: 3,
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
    userId: null,
    dataStatus: "idle",
    profile,
    settings: initialSettings,
    beginUser: (userId) =>
      set({
        userId,
        dataStatus: "loading",
        profile: { ...initialProfile },
        settings: { ...initialSettings },
      }),
    hydrate: (userId, profileChanges, settingsChanges) =>
      set({
        userId,
        dataStatus: "ready",
        profile: { ...initialProfile, ...profileChanges },
        settings: { ...initialSettings, ...settingsChanges },
      }),
    resetUserData: () =>
      set({
        userId: null,
        dataStatus: "idle",
        profile: { ...initialProfile },
        settings: { ...initialSettings },
      }),
    setProfile: (changes) => {
      const nextProfile = { ...get().profile, ...changes };
      storage?.write(nextProfile);
      set({ profile: nextProfile });
    },
    setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
    reset: () => {
      storage?.clear();
      set({ profile: { ...initialProfile }, settings: { ...initialSettings } });
    },
  }));
};
export const useProfileStore = createProfileStore(taroProfileStorage);
