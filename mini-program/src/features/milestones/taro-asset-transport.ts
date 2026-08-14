import Taro from "@tarojs/taro";
import { getLocalFileInfo, saveLocalFile } from "../../utils/file-system-info";
import type { MilestoneIllustrationTransport } from "./asset-cache";

export function createTaroMilestoneIllustrationTransport(): MilestoneIllustrationTransport {
  return {
    getFileInfo: async ({ filePath }) => {
      return getLocalFileInfo(filePath);
    },
    downloadFile: async ({ url }) => {
      const result = await Taro.downloadFile({ url });
      return {
        statusCode: typeof result.statusCode === "number" ? result.statusCode : undefined,
        tempFilePath: typeof result.tempFilePath === "string" ? result.tempFilePath : undefined,
      };
    },
    saveFile: async ({ tempFilePath }) => {
      return {
        savedFilePath: await saveLocalFile(tempFilePath),
      };
    },
    getCachedPath: (key) => {
      const value = Taro.getStorageSync(key);
      return typeof value === "string" && value ? value : null;
    },
    setCachedPath: (key, path) => {
      Taro.setStorageSync(key, path);
    },
    removeCachedPath: (key) => {
      Taro.removeStorageSync(key);
    },
  };
}
