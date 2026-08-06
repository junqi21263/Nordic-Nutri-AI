const { pickDefaultAvatarSentinel } = require("./profile-avatar-service.cjs");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND_PRIORITY = { vision: 0, blocked: 1, avatar: 2, asset: 3 };
const VALID_KINDS = new Set(["all", "vision", "blocked", "avatar", "asset"]);
const IN_CHUNK = 80;

class PublicUserImageError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function clampPage(page) {
  return Math.min(10_000, Math.max(1, Number(page) || 1));
}

function clampPageSize(pageSize) {
  return Math.min(100, Math.max(1, Number(pageSize) || 40));
}

function normalizeUserId(userId) {
  if (userId == null || userId === "") return null;
  const value = String(userId).trim();
  if (!UUID_RE.test(value)) {
    throw new PublicUserImageError("USER_IMAGE_USER_ID_INVALID", "用户 ID 无效");
  }
  return value;
}

function isFoodsPath(path) {
  if (typeof path !== "string" || !path) return false;
  return /(^|\/)foods\//.test(path);
}

function isDefaultAvatar(path) {
  return typeof path === "string" && path.startsWith("default:");
}

function isDataUrl(path) {
  return typeof path === "string" && path.startsWith("data:");
}

function needsCloudDelete(path) {
  if (typeof path !== "string" || !path) return false;
  if (isDefaultAvatar(path) || isDataUrl(path) || isFoodsPath(path)) return false;
  return true;
}

function mealNameFromRow(row) {
  const raw = row?.raw_recognition;
  if (!raw || typeof raw !== "object") return null;
  return typeof raw.mealName === "string" ? raw.mealName : null;
}

function createUserImageOpsService({
  db,
  resolveTempFileUrls,
  resolveOneUrl,
  deleteFiles,
} = {}) {
  if (!db || typeof db.from !== "function") throw new Error("User image ops database is unavailable");
  if (typeof deleteFiles !== "function") throw new Error("User image ops deleteFiles is unavailable");

  async function withTempUrls(items) {
    const paths = items
      .map((item) => item.imagePath)
      .filter((path) => typeof path === "string" && path.length > 0 && !isDataUrl(path) && !isDefaultAvatar(path));
    let urlMap = new Map();
    if (paths.length && typeof resolveTempFileUrls === "function") {
      try {
        urlMap = await resolveTempFileUrls(paths);
      } catch (error) {
        console.warn("[user-image-ops] resolveTempFileUrls failed:", error?.message || error);
      }
    }
    const resolved = [];
    for (const item of items) {
      if (isDataUrl(item.imagePath)) {
        resolved.push({ ...item, imageUrl: item.imagePath });
        continue;
      }
      if (isDefaultAvatar(item.imagePath)) {
        resolved.push({ ...item, imageUrl: null });
        continue;
      }
      let imageUrl = item.imagePath ? (urlMap.get(item.imagePath) || null) : null;
      if (!imageUrl && item.imagePath && typeof resolveOneUrl === "function") {
        try {
          imageUrl = await resolveOneUrl(item.imagePath);
        } catch (error) {
          console.warn("[user-image-ops] resolveOneUrl failed:", error?.message || error);
        }
      }
      resolved.push({ ...item, imageUrl: imageUrl || null });
    }
    return resolved;
  }

  async function loadProtectedPathSet(paths) {
    const unique = [...new Set((paths || []).filter(Boolean))];
    const protectedPaths = new Set();
    if (!unique.length) return protectedPaths;
    try {
      for (let i = 0; i < unique.length; i += IN_CHUNK) {
        const chunk = unique.slice(i, i + IN_CHUNK);
        const meals = await db.from("meal_records").select("image_path").in("image_path", chunk);
        if (meals?.error) {
          console.warn("[user-image-ops] meal protect read failed:", meals.error);
          continue;
        }
        for (const row of meals?.data ?? []) {
          if (row?.image_path) protectedPaths.add(row.image_path);
        }
      }
    } catch (error) {
      console.warn("[user-image-ops] meal protect failed:", error?.message || error);
    }
    return protectedPaths;
  }

  async function isPathMealLinked(imagePath) {
    if (!imagePath) return false;
    const result = await db
      .from("meal_records")
      .select("id")
      .eq("image_path", imagePath)
      .limit(1);
    if (result?.error) throw new Error("User image meal link check failed");
    return (result.data ?? []).length > 0;
  }

  async function isPathOnAnalysis(imagePath, excludeId = null) {
    if (!imagePath) return false;
    const result = await db
      .from("ai_analysis")
      .select("id")
      .eq("image_path", imagePath)
      .limit(5);
    if (result?.error) throw new Error("User image analysis link check failed");
    const rows = result.data ?? [];
    if (!excludeId) return rows.length > 0;
    return rows.some((row) => row.id !== excludeId);
  }

  function markProtected(item, protectedPaths) {
    if (isFoodsPath(item.imagePath)) {
      return { ...item, protected: true, protectReason: "食材库图片不可删除" };
    }
    if (item.kind === "avatar" && isDefaultAvatar(item.imagePath)) {
      return { ...item, protected: true, protectReason: "默认头像无需删除" };
    }
    if (item.imagePath && protectedPaths.has(item.imagePath)) {
      return { ...item, protected: true, protectReason: "已关联餐食，请先解绑" };
    }
    return { ...item, protected: false, protectReason: null };
  }

  async function countExact(buildQuery) {
    try {
      const result = await buildQuery();
      if (result?.error) return null;
      if (typeof result?.count === "number") return result.count;
      return null;
    } catch (error) {
      console.warn("[user-image-ops] count failed:", error?.message || error);
      return null;
    }
  }

  async function fetchVisionPage({ userId, page, pageSize }) {
    const offset = (page - 1) * pageSize;
    let listQuery = db
      .from("ai_analysis")
      .select("id,user_id,image_path,status,review_status,raw_recognition,created_at")
      .not("image_path", "is", null);
    if (userId) listQuery = listQuery.eq("user_id", userId);
    listQuery = listQuery.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
    const listResult = await listQuery;
    if (listResult?.error) {
      throw new Error(`User image vision list failed: ${listResult.error.message || listResult.error}`);
    }

    const total = await countExact(() => {
      let countQuery = db
        .from("ai_analysis")
        .select("id", { count: "exact", head: true })
        .not("image_path", "is", null);
      if (userId) countQuery = countQuery.eq("user_id", userId);
      return countQuery;
    });

    const items = (listResult.data ?? []).map((row) => ({
      kind: "vision",
      id: row.id,
      userId: row.user_id,
      imagePath: row.image_path,
      createdAt: row.created_at,
      status: row.status,
      reviewStatus: row.review_status || "pending",
      mealName: mealNameFromRow(row),
    }));
    const resolvedTotal = total == null
      ? (offset + items.length + (items.length === pageSize ? 1 : 0))
      : total;
    return { items, total: resolvedTotal, totalApproximate: total == null };
  }

  async function fetchBlockedPage({ userId, page, pageSize, status }) {
    const offset = (page - 1) * pageSize;
    let listQuery = db
      .from("content_moderation_flags")
      .select("id,user_id,status,image_path,created_at")
      .eq("source", "vision")
      .not("image_path", "is", null);
    if (userId) listQuery = listQuery.eq("user_id", userId);
    if (status && status !== "all") listQuery = listQuery.eq("status", status);
    listQuery = listQuery.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
    const listResult = await listQuery;
    if (listResult?.error) {
      throw new Error(`User image blocked list failed: ${listResult.error.message || listResult.error}`);
    }

    const total = await countExact(() => {
      let countQuery = db
        .from("content_moderation_flags")
        .select("id", { count: "exact", head: true })
        .eq("source", "vision")
        .not("image_path", "is", null);
      if (userId) countQuery = countQuery.eq("user_id", userId);
      if (status && status !== "all") countQuery = countQuery.eq("status", status);
      return countQuery;
    });

    const items = (listResult.data ?? []).map((row) => ({
      kind: "blocked",
      id: row.id,
      userId: row.user_id,
      imagePath: row.image_path,
      createdAt: row.created_at,
      status: row.status,
    }));
    const resolvedTotal = total == null
      ? (offset + items.length + (items.length === pageSize ? 1 : 0))
      : total;
    return { items, total: resolvedTotal, totalApproximate: total == null };
  }

  async function fetchAvatarPage({ userId, page, pageSize }) {
    const offset = (page - 1) * pageSize;
    const fetchSize = Math.min(500, Math.max(pageSize * 5, pageSize));
    let listQuery = db
      .from("profiles")
      .select("id,avatar_path,updated_at,created_at")
      .not("avatar_path", "is", null);
    if (userId) listQuery = listQuery.eq("id", userId);
    listQuery = listQuery.order("updated_at", { ascending: false }).limit(fetchSize);
    const listResult = await listQuery;
    if (listResult?.error) {
      throw new Error(`User image avatar list failed: ${listResult.error.message || listResult.error}`);
    }

    const custom = (listResult.data ?? [])
      .filter((row) => typeof row.avatar_path === "string" && row.avatar_path && !isDefaultAvatar(row.avatar_path))
      .map((row) => ({
        kind: "avatar",
        id: row.id,
        userId: row.id,
        imagePath: row.avatar_path,
        createdAt: row.updated_at || row.created_at,
      }));

    return {
      items: custom.slice(offset, offset + pageSize),
      total: custom.length,
      totalApproximate: !userId && custom.length >= fetchSize,
    };
  }

  async function fetchAssetPage({ userId, page, pageSize }) {
    const offset = (page - 1) * pageSize;
    let listQuery = db
      .from("uploaded_assets")
      .select("id,user_id,object_path,status,created_at")
      .neq("status", "deleted");
    if (userId) listQuery = listQuery.eq("user_id", userId);
    listQuery = listQuery.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
    const listResult = await listQuery;
    if (listResult?.error) {
      throw new Error(`User image asset list failed: ${listResult.error.message || listResult.error}`);
    }

    const total = await countExact(() => {
      let countQuery = db
        .from("uploaded_assets")
        .select("id", { count: "exact", head: true })
        .neq("status", "deleted");
      if (userId) countQuery = countQuery.eq("user_id", userId);
      return countQuery;
    });

    const items = (listResult.data ?? [])
      .filter((row) => !isFoodsPath(row.object_path))
      .map((row) => ({
        kind: "asset",
        id: row.id,
        userId: row.user_id,
        imagePath: row.object_path,
        createdAt: row.created_at,
        status: row.status,
      }));
    const resolvedTotal = total == null
      ? (offset + items.length + (items.length === pageSize ? 1 : 0))
      : total;
    return { items, total: resolvedTotal, totalApproximate: total == null };
  }

  function dedupeByPath(items) {
    const best = new Map();
    for (const item of items) {
      const key = item.imagePath || `${item.kind}:${item.id}`;
      const existing = best.get(key);
      if (!existing) {
        best.set(key, item);
        continue;
      }
      const existingRank = KIND_PRIORITY[existing.kind] ?? 99;
      const nextRank = KIND_PRIORITY[item.kind] ?? 99;
      if (nextRank < existingRank) best.set(key, item);
    }
    return [...best.values()].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }

  async function safeFetch(label, fn) {
    try {
      return await fn();
    } catch (error) {
      console.error(`[user-image-ops] ${label} failed:`, error?.message || error);
      return { items: [], total: 0, totalApproximate: true, failed: true, error: error?.message || String(error) };
    }
  }

  async function fetchAllPage({ userId, page, pageSize, status }) {
    const pull = Math.min(120, Math.max(pageSize * 2, 40));
    const [vision, blocked, avatar, asset] = await Promise.all([
      safeFetch("vision", () => fetchVisionPage({ userId, page: 1, pageSize: pull })),
      safeFetch("blocked", () => fetchBlockedPage({ userId, page: 1, pageSize: pull, status: status || "all" })),
      safeFetch("avatar", () => fetchAvatarPage({ userId, page: 1, pageSize: pull })),
      safeFetch("asset", () => fetchAssetPage({ userId, page: 1, pageSize: pull })),
    ]);
    const failures = [vision, blocked, avatar, asset].filter((part) => part.failed);
    if (failures.length === 4) {
      throw new Error(failures.map((part) => part.error).filter(Boolean).join("; ") || "User image sources unavailable");
    }
    const merged = dedupeByPath([
      ...vision.items,
      ...blocked.items,
      ...avatar.items,
      ...asset.items,
    ]);
    const offset = (page - 1) * pageSize;
    return {
      items: merged.slice(offset, offset + pageSize),
      total: merged.length,
      totalApproximate: true,
    };
  }

  async function markAssetDeleted(imagePath) {
    if (!imagePath) return;
    const updated = await db
      .from("uploaded_assets")
      .update({ status: "deleted" })
      .eq("object_path", imagePath);
    if (updated?.error) {
      console.warn("[user-image-ops] mark asset deleted skipped:", updated.error?.message || updated.error);
    }
  }

  async function deleteCloudIfNeeded(imagePath) {
    if (!needsCloudDelete(imagePath)) return;
    if (isFoodsPath(imagePath)) {
      throw new PublicUserImageError("USER_IMAGE_PROTECTED", "食材库图片不可删除");
    }
    await deleteFiles({ cloudPaths: [imagePath] });
  }

  return {
    async list({
      kind = "all",
      userId: rawUserId,
      page: rawPage = 1,
      pageSize: rawPageSize = 40,
      status = "all",
    } = {}) {
      const resolvedKind = String(kind || "all");
      if (!VALID_KINDS.has(resolvedKind)) {
        throw new PublicUserImageError("USER_IMAGE_KIND_INVALID", "图片类型无效");
      }
      const userId = normalizeUserId(rawUserId);
      const page = clampPage(rawPage);
      const pageSize = clampPageSize(rawPageSize);

      let pageResult;
      if (resolvedKind === "vision") pageResult = await fetchVisionPage({ userId, page, pageSize });
      else if (resolvedKind === "blocked") pageResult = await fetchBlockedPage({ userId, page, pageSize, status });
      else if (resolvedKind === "avatar") pageResult = await fetchAvatarPage({ userId, page, pageSize });
      else if (resolvedKind === "asset") pageResult = await fetchAssetPage({ userId, page, pageSize });
      else pageResult = await fetchAllPage({ userId, page, pageSize, status });

      const protectedPaths = await loadProtectedPathSet(pageResult.items.map((item) => item.imagePath));
      const withFlags = pageResult.items.map((item) => markProtected(item, protectedPaths));
      const withUrls = await withTempUrls(withFlags);

      return {
        kind: resolvedKind,
        page,
        pageSize,
        total: pageResult.total,
        totalApproximate: Boolean(pageResult.totalApproximate),
        items: withUrls,
      };
    },

    async delete({ kind, id }) {
      const resolvedKind = String(kind || "");
      if (!["vision", "blocked", "avatar", "asset"].includes(resolvedKind)) {
        throw new PublicUserImageError("USER_IMAGE_KIND_INVALID", "图片类型无效");
      }
      if (typeof id !== "string" || !UUID_RE.test(id)) {
        throw new PublicUserImageError("USER_IMAGE_ID_INVALID", "图片记录无效");
      }

      if (resolvedKind === "vision") {
        const row = await db
          .from("ai_analysis")
          .select("id,image_path,user_id")
          .eq("id", id)
          .maybeSingle();
        if (row?.error) throw new Error("User image vision read failed");
        if (!row?.data) throw new PublicUserImageError("USER_IMAGE_NOT_FOUND", "识图记录不存在");
        const imagePath = row.data.image_path;
        if (imagePath && isFoodsPath(imagePath)) {
          throw new PublicUserImageError("USER_IMAGE_PROTECTED", "食材库图片不可删除");
        }
        if (imagePath && await isPathMealLinked(imagePath)) {
          throw new PublicUserImageError("USER_IMAGE_PROTECTED", "已关联餐食，请先解绑");
        }
        await deleteCloudIfNeeded(imagePath);
        const updated = await db.from("ai_analysis").update({ image_path: null }).eq("id", id);
        if (updated?.error) throw new Error("User image vision clear failed");
        await markAssetDeleted(imagePath);
        return { kind: "vision", id, deleted: true };
      }

      if (resolvedKind === "blocked") {
        const row = await db
          .from("content_moderation_flags")
          .select("id,image_path,user_id,status")
          .eq("id", id)
          .maybeSingle();
        if (row?.error) throw new Error("User image blocked read failed");
        if (!row?.data) throw new PublicUserImageError("USER_IMAGE_NOT_FOUND", "违规记录不存在");
        const imagePath = row.data.image_path;
        if (imagePath && await isPathMealLinked(imagePath)) {
          throw new PublicUserImageError("USER_IMAGE_PROTECTED", "已关联餐食，请先解绑");
        }
        await deleteCloudIfNeeded(imagePath);
        const updated = await db
          .from("content_moderation_flags")
          .update({ image_path: null, status: "reviewed" })
          .eq("id", id);
        if (updated?.error) throw new Error("User image blocked clear failed");
        return { kind: "blocked", id, deleted: true };
      }

      if (resolvedKind === "avatar") {
        const row = await db
          .from("profiles")
          .select("id,avatar_path")
          .eq("id", id)
          .maybeSingle();
        if (row?.error) throw new Error("User image avatar read failed");
        if (!row?.data) throw new PublicUserImageError("USER_IMAGE_NOT_FOUND", "用户不存在");
        const imagePath = row.data.avatar_path;
        if (!imagePath || isDefaultAvatar(imagePath)) {
          throw new PublicUserImageError("USER_IMAGE_PROTECTED", "默认头像无需删除");
        }
        await deleteCloudIfNeeded(imagePath);
        const nextAvatar = pickDefaultAvatarSentinel();
        const updated = await db
          .from("profiles")
          .update({ avatar_path: nextAvatar })
          .eq("id", id);
        if (updated?.error) throw new Error("User image avatar reset failed");
        return { kind: "avatar", id, deleted: true, avatarPath: nextAvatar };
      }

      const row = await db
        .from("uploaded_assets")
        .select("id,object_path,user_id,status")
        .eq("id", id)
        .maybeSingle();
      if (row?.error) throw new Error("User image asset read failed");
      if (!row?.data) throw new PublicUserImageError("USER_IMAGE_NOT_FOUND", "资产记录不存在");
      const imagePath = row.data.object_path;
      if (isFoodsPath(imagePath)) {
        throw new PublicUserImageError("USER_IMAGE_PROTECTED", "食材库图片不可删除");
      }
      if (await isPathMealLinked(imagePath)) {
        throw new PublicUserImageError("USER_IMAGE_PROTECTED", "已关联餐食，请先解绑");
      }
      if (await isPathOnAnalysis(imagePath)) {
        throw new PublicUserImageError("USER_IMAGE_PROTECTED", "仍被识图记录引用，请先删识图");
      }
      await deleteCloudIfNeeded(imagePath);
      const updated = await db
        .from("uploaded_assets")
        .update({ status: "deleted" })
        .eq("id", id);
      if (updated?.error) throw new Error("User image asset delete failed");
      return { kind: "asset", id, deleted: true };
    },
  };
}

module.exports = {
  createUserImageOpsService,
  PublicUserImageError,
  KIND_PRIORITY,
  clampPage,
  clampPageSize,
  isFoodsPath,
  needsCloudDelete,
};
