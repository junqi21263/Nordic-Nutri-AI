/**
 * Product-session helpers: after JWT verify, confirm the subject still exists in
 * app_users so cancelled accounts cannot keep calling APIs with a live token.
 */

function createProductUserExists(db, { ttlMs = 5_000, clock = () => Date.now() } = {}) {
  if (!db || typeof db.from !== "function") {
    throw new Error("Product user existence lookup requires a database client");
  }
  const cache = new Map();

  return async function productUserExists(userId) {
    if (typeof userId !== "string" || !userId) return false;
    const now = clock();
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now) return cached.exists;

    const result = await db.from("app_users").select("id").eq("id", userId).maybeSingle();
    if (result?.error) {
      const error = new Error(result.error.message || "Product user lookup failed");
      error.code = "SESSION_LOOKUP_FAILED";
      throw error;
    }
    const exists = Boolean(result?.data?.id);
    cache.set(userId, { exists, expiresAt: now + ttlMs });
    return exists;
  };
}

/**
 * @param {{ verifySession?: Function, productUserExists?: Function }} service
 * @param {string | null} token
 * @returns {Promise<{ session: object } | { error: { status: number, body: object } }>}
 */
async function resolveProductSession(service, token) {
  const session = service?.verifySession?.(token);
  if (!session?.sub) {
    return { error: { status: 401, body: { code: "UNAUTHORIZED" } } };
  }
  if (typeof service.productUserExists !== "function") {
    return { session };
  }
  try {
    const exists = await service.productUserExists(session.sub);
    if (!exists) {
      return {
        error: {
          status: 401,
          body: { code: "SESSION_USER_MISSING", message: "登录已失效，请重新登录" },
        },
      };
    }
  } catch (error) {
    if (error?.code === "SESSION_LOOKUP_FAILED") {
      return { error: { status: 503, body: { code: "SESSION_LOOKUP_FAILED" } } };
    }
    throw error;
  }
  return { session };
}

module.exports = {
  createProductUserExists,
  resolveProductSession,
};
