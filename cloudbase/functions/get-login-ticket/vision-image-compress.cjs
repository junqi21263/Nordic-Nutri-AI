function loadSharp() {
  try {
    return require("sharp");
  } catch {
    return null;
  }
}

/**
 * Re-encode vision photos before durable storage / model upload.
 * Keeps plate recognition quality while shrinking typical 2–8MB phone shots
 * to roughly a few hundred KB–1.5MB.
 */
async function compressVisionImageForStorage(
  buffer,
  contentType,
  {
    sharpFactory = loadSharp,
    maxEdge = 1920,
    quality = 80,
  } = {},
) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return { buffer, contentType, compressed: false };
  }
  const sharp = typeof sharpFactory === "function" ? sharpFactory() : null;
  if (!sharp) {
    return { buffer, contentType: contentType || "image/jpeg", compressed: false };
  }
  try {
    const out = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    // Prefer compressed result when it is meaningfully smaller or format was non-jpeg.
    if (out.length < buffer.length || contentType !== "image/jpeg") {
      return { buffer: out, contentType: "image/jpeg", compressed: true };
    }
    return { buffer, contentType: contentType || "image/jpeg", compressed: false };
  } catch (error) {
    console.warn("[vision-compress] storage compress failed:", error?.message || error);
    return { buffer, contentType: contentType || "image/jpeg", compressed: false };
  }
}

module.exports = {
  compressVisionImageForStorage,
  loadSharp,
};
