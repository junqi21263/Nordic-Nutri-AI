type ImageInfo = { path?: string };
type ImageInfoResolver = (options: { src: string }) => Promise<ImageInfo>;

export function getMilestonePosterImageCandidates(source: string) {
  const normalized = source.trim();
  if (!normalized || normalized.startsWith("data:") || normalized.startsWith("http")) {
    return [normalized];
  }
  if (normalized.startsWith("/")) {
    const packagePath = normalized.replace(/^\/+/, "");
    return [`../../${packagePath}`, normalized, packagePath];
  }
  return [normalized, `../../${normalized}`, `/${normalized}`];
}

/**
 * Canvas 2D on WeChat accepts a device-local image path more reliably than a
 * webpack package URL. Resolve packaged assets through the native image
 * service before assigning them to canvas.createImage().src.
 */
export async function resolveMilestonePosterImageSource(
  source: string,
  resolver: ImageInfoResolver,
): Promise<string> {
  let lastError: unknown;
  for (const candidate of getMilestonePosterImageCandidates(source)) {
    try {
      const info = await resolver({ src: candidate });
      if (typeof info.path === "string" && info.path.trim()) return info.path;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("插画读取失败，请稍后重试");
}
