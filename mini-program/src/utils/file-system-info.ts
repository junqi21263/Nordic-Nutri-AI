import Taro from "@tarojs/taro";

/** Read temporary or cached file metadata without the deprecated global file-info API. */
export function getLocalFileInfo(filePath: string): Promise<{ size?: number }> {
  const fileSystem = Taro.getFileSystemManager();
  return new Promise((resolve, reject) => {
    fileSystem.getFileInfo({
      filePath,
      success: (result) => resolve({ size: result.size }),
      fail: reject,
    });
  });
}

/** Persist a downloaded temporary asset without the deprecated global save-file API. */
export function saveLocalFile(filePath: string): Promise<string> {
  const fileSystem = Taro.getFileSystemManager();
  return new Promise((resolve, reject) => {
    fileSystem.saveFile({
      tempFilePath: filePath,
      success: ({ savedFilePath }) => resolve(savedFilePath),
      fail: reject,
    });
  });
}
