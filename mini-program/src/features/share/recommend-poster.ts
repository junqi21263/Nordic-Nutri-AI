import Taro from "@tarojs/taro";
import { RECOMMEND_POSTER_IMAGE } from "./brand-cdn";

export { RECOMMEND_POSTER_IMAGE };

let cachedLocalPath: string | null = null;

/** Download the CDN poster once per session for share/save APIs that need a local path. */
export async function ensureRecommendPosterLocalPath(): Promise<string> {
  if (cachedLocalPath) {
    try {
      await Taro.getFileInfo({ filePath: cachedLocalPath });
      return cachedLocalPath;
    } catch {
      cachedLocalPath = null;
    }
  }
  const downloaded = await Taro.downloadFile({ url: RECOMMEND_POSTER_IMAGE });
  if (downloaded.statusCode !== 200 || !downloaded.tempFilePath) {
    throw new Error("海报下载失败，请稍后重试");
  }
  cachedLocalPath = downloaded.tempFilePath;
  return cachedLocalPath;
}

/** Open WeChat's native share-image sheet (friends / Moments / etc.). */
export async function shareRecommendPosterToWechat(): Promise<void> {
  const path = await ensureRecommendPosterLocalPath();
  if (typeof Taro.showShareImageMenu !== "function") {
    throw new Error("当前基础库不支持分享图片，请升级微信后重试");
  }
  try {
    await Taro.showShareImageMenu({ path });
  } catch (error) {
    const errMsg =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error && "errMsg" in error
          ? String((error as { errMsg: unknown }).errMsg)
          : "";
    if (/cancel|取消/i.test(errMsg)) throw error;
    // DevTools often rejects showShareImageMenu; fall back to album save prompt path.
    if (/not support|fail|undefined|simulate/i.test(errMsg) || !errMsg) {
      throw new Error("请在真机上使用微信分享，或改用「保存」后转发图片");
    }
    throw error instanceof Error ? error : new Error(errMsg || "分享失败，请稍后重试");
  }
}

async function ensureAlbumPermission(): Promise<boolean> {
  try {
    const setting = await Taro.getSetting();
    if (setting.authSetting["scope.writePhotosAlbum"]) return true;
  } catch {
    // Fall through to authorize.
  }
  try {
    await Taro.authorize({ scope: "scope.writePhotosAlbum" });
    return true;
  } catch {
    const modal = await Taro.showModal({
      title: "需要相册权限",
      content: "请允许保存图片到相册，以便下载推荐海报",
      confirmText: "去设置",
      cancelText: "取消",
    });
    if (!modal.confirm) return false;
    await Taro.openSetting();
    const after = await Taro.getSetting();
    return Boolean(after.authSetting["scope.writePhotosAlbum"]);
  }
}

/** Save the recommend poster into the device photo album. */
export async function saveRecommendPosterToAlbum(): Promise<void> {
  const allowed = await ensureAlbumPermission();
  if (!allowed) throw new Error("未获得相册权限");
  const filePath = await ensureRecommendPosterLocalPath();
  await Taro.saveImageToPhotosAlbum({ filePath });
}
