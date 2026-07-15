import Taro from "@tarojs/taro";
import type { SessionStorage } from "../auth/types";

export function createTaroSessionStorage(): SessionStorage {
  return {
    getItem: (key) => Taro.getStorageSync(key) || null,
    setItem: (key, value) => Taro.setStorageSync(key, value),
    removeItem: (key) => Taro.removeStorageSync(key),
  };
}
