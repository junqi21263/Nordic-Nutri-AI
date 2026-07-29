// Stable image URL resolution for CloudBase Storage.
// `storage_path` is the canonical value persisted in PostgreSQL. Display URLs
// are derived at read time so a CDN/custom-domain change never requires a data
// migration and temporary URLs are never persisted as canonical image fields.

function normalizeStoragePath(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^(?:https?:)?\/\//i.test(value)) {
    throw new Error("FOOD_IMAGE_STORAGE_PATH_INVALID");
  }
  if (value.toLowerCase().startsWith("cloud://")) {
    const parsed = new URL(value);
    return parsed.pathname.replace(/^\/+/, "");
  }
  return value.replace(/^\/+/, "");
}

function validateBaseUrl(raw) {
  if (!raw) return null;
  let parsed;
  try { parsed = new URL(String(raw).trim()); } catch { throw new Error("FOOD_IMAGE_CDN_BASE_URL_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.search || parsed.hash) {
    throw new Error("FOOD_IMAGE_CDN_BASE_URL_INVALID");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function appendPath(baseUrl, path) {
  const encoded = path.split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/");
  return `${baseUrl}/${encoded}`;
}

function imageDirectory(storagePath) {
  const normalized = normalizeStoragePath(storagePath);
  if (!normalized) return "";
  if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(normalized)) {
    return normalized.slice(0, normalized.lastIndexOf("/"));
  }
  return normalized;
}

function createFoodStorageUrlResolver({ baseUrl } = {}) {
  const cdnBaseUrl = validateBaseUrl(baseUrl);

  return {
    baseUrl: cdnBaseUrl,
    resolveVariants(storagePath) {
      const directory = imageDirectory(storagePath);
      if (!cdnBaseUrl || !directory) return null;
      const prefix = directory.startsWith("foods/") ? "imported" : "generated";
      const names = prefix === "imported"
        ? { thumbnail: "thumb.webp", list: "medium.webp", detail: "detail.webp" }
        : { thumbnail: "thumbnail.webp", list: "list.webp", detail: "detail.webp" };
      return {
        thumbnailUrl: appendPath(cdnBaseUrl, `${directory}/${names.thumbnail}`),
        listUrl: appendPath(cdnBaseUrl, `${directory}/${names.list}`),
        detailUrl: appendPath(cdnBaseUrl, `${directory}/${names.detail}`),
      };
    },
  };
}

module.exports = { createFoodStorageUrlResolver, normalizeStoragePath };
