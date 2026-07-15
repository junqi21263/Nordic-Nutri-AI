import { create } from "zustand";

interface TabBarStore {
  activeKey: string;
  visible: boolean;
  setActiveKey: (activeKey: string) => void;
  setVisible: (visible: boolean) => void;
}

export const useTabBarStore = create<TabBarStore>((set) => ({
  activeKey: "home",
  visible: true,
  setActiveKey: (activeKey) => set({ activeKey }),
  setVisible: (visible) => set({ visible }),
}));
