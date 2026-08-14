export type MilestoneIllustrationAsset = {
  id: string;
  /** Development-only packaged fallback. Production intentionally omits it. */
  localSource?: string;
  remoteSource?: string;
  version: string;
};

export type MilestoneIllustrationTransport = {
  getFileInfo: (options: { filePath: string }) => Promise<{ size?: number }>;
  downloadFile: (options: { url: string }) => Promise<{ statusCode?: number; tempFilePath?: string }>;
  saveFile: (options: { tempFilePath: string }) => Promise<{ savedFilePath?: string }>;
  getCachedPath: (key: string) => string | null;
  setCachedPath: (key: string, path: string) => void;
  removeCachedPath?: (key: string) => void;
};

export const MILESTONE_ASSET_CACHE_PREFIX = "nordic-nutri:milestone-illustration:";
const inFlightResolutions = new Map<string, Promise<string>>();

export function createMilestoneIllustrationCacheKey(id: string, version: string) {
  return `${MILESTONE_ASSET_CACHE_PREFIX}${id}:${version}`;
}

function isRemoteSource(source: string | undefined): source is string {
  return typeof source === "string" && /^https:\/\//i.test(source);
}

async function isValidCachedPath(path: string | null, transport: MilestoneIllustrationTransport) {
  if (!path) return false;
  try {
    const info = await transport.getFileInfo({ filePath: path });
    return typeof info.size === "number" && info.size > 0;
  } catch {
    return false;
  }
}

/**
 * Resolve an illustration for Canvas/Image. Development may fall back to a
 * packaged asset; production deliberately reports an unavailable CDN asset
 * rather than silently using a missing or stale local illustration.
 */
export async function resolveMilestoneIllustrationSource(
  asset: MilestoneIllustrationAsset,
  transport: MilestoneIllustrationTransport,
): Promise<string> {
  const remoteSource = asset.remoteSource;
  if (!isRemoteSource(remoteSource)) {
    if (asset.localSource) return asset.localSource;
    throw new Error("正式里程碑插画 CDN 未配置");
  }

  const cacheKey = createMilestoneIllustrationCacheKey(asset.id, asset.version);
  const cachedPath = transport.getCachedPath(cacheKey);
  if (await isValidCachedPath(cachedPath, transport)) return cachedPath as string;
  if (cachedPath) transport.removeCachedPath?.(cacheKey);

  const existingRequest = inFlightResolutions.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const downloaded = await transport.downloadFile({ url: remoteSource });
    if (downloaded.statusCode !== 200 || !downloaded.tempFilePath) {
      throw new Error("正式里程碑插画下载失败");
    }
    const tempFilePath = downloaded.tempFilePath;
    try {
      const saved = await transport.saveFile({ tempFilePath });
      if (saved.savedFilePath) {
        transport.setCachedPath(cacheKey, saved.savedFilePath);
        return saved.savedFilePath;
      }
    } catch {
      // The downloaded temporary file remains usable for this page session,
      // but a failed save must never create a stale persistent cache record.
    }
    return tempFilePath;
  })();
  inFlightResolutions.set(cacheKey, request);

  try {
    return await request;
  } catch (error) {
    if (asset.localSource) return asset.localSource;
    throw error;
  } finally {
    if (inFlightResolutions.get(cacheKey) === request) inFlightResolutions.delete(cacheKey);
  }
}
