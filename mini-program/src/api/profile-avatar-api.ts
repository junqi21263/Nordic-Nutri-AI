import Taro from "@tarojs/taro";
import { uploadProductAvatar } from "./product-data-api";

const MAX_AVATAR_BYTES = 1_500_000;

function readBase64(filePath: string) {
  const fileSystem = Taro.getFileSystemManager();
  return new Promise<string>((resolve, reject) => {
    fileSystem.readFile({
      filePath,
      encoding: "base64",
      success: (result) => typeof result.data === "string" ? resolve(result.data) : reject(new Error("头像读取失败")),
      fail: reject,
    });
  });
}

function contentTypeForBase64(base64: string): "image/jpeg" | "image/png" | "image/webp" {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  throw new Error("图片格式不支持，请使用 JPG、PNG 或 WebP 图片");
}

export async function uploadProfileAvatar(sourcePath: string) {
  const compressed = await Taro.compressImage({ src: sourcePath, quality: 75 });
  const info = await Taro.getFileInfo({ filePath: compressed.tempFilePath });
  if (!("size" in info) || info.size > MAX_AVATAR_BYTES) throw new Error("头像过大，请选择 1.5MB 以内的图片");
  const base64 = await readBase64(compressed.tempFilePath);
  return uploadProductAvatar({ mimeType: contentTypeForBase64(base64), base64 });
}
