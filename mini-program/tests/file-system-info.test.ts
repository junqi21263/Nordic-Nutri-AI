import { beforeEach, describe, expect, it, vi } from "vitest";

const getFileInfo = vi.fn();
const saveFile = vi.fn();

vi.mock("@tarojs/taro", () => ({
  default: {
    getFileSystemManager: () => ({ getFileInfo, saveFile }),
  },
}));

import { getLocalFileInfo, saveLocalFile } from "../src/utils/file-system-info";

describe("local file info", () => {
  beforeEach(() => {
    getFileInfo.mockReset();
    saveFile.mockReset();
  });

  it("reads a temporary or cached file through FileSystemManager", async () => {
    getFileInfo.mockImplementation(({ success }) => success({ size: 321 }));

    await expect(getLocalFileInfo("wxfile://tmp/image.jpg")).resolves.toEqual({ size: 321 });
    expect(getFileInfo).toHaveBeenCalledWith(expect.objectContaining({ filePath: "wxfile://tmp/image.jpg" }));
  });

  it("propagates a file-system read failure", async () => {
    const missing = new Error("file not exist");
    getFileInfo.mockImplementation(({ fail }) => fail(missing));

    await expect(getLocalFileInfo("wxfile://missing.jpg")).rejects.toThrow("file not exist");
  });

  it("persists an asset through FileSystemManager rather than the deprecated save API", async () => {
    saveFile.mockImplementation(({ success }) => success({ savedFilePath: "wxfile://saved/image.jpg" }));

    await expect(saveLocalFile("wxfile://tmp/image.jpg")).resolves.toBe("wxfile://saved/image.jpg");
    expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({ tempFilePath: "wxfile://tmp/image.jpg" }));
  });
});
