/**
 * Product-session helpers: after JWT verify, confirm the subject still exists in
 * app_users so cancelled accounts cannot keep calling APIs with a live token.
 */

function createProductUserExists(db, { ttlMs = 5_000, clock = () => Date.now() } = {}) {
  if (!db || typeof db.from !== "function") {
    throw new Error("Product user existence lookup requires a database client");
  }
  const cache = new Map();

  return async function productUserExists(principal, tokenVersionOverride = null) {
    const userId = typeof principal === "string" ? principal : principal?.sub;
    const tokenVersion = tokenVersionOverride ?? (typeof principal === "object" ? principal?.ver : null);
    if (typeof userId !== "string" || !userId) return false;
    const now = clock();
    const canCache = tokenVersion == null;
    const cached = canCache ? cache.get(userId) : null;
    if (cached && cached.expiresAt > now) return cached.exists;

    const result = await db.from("app_users").select("id,status,token_version").eq("id", userId).maybeSingle();
    if (result?.error) {
      const error = new Error(result.error.message || "Product user lookup failed");
      error.code = "SESSION_LOOKUP_FAILED";
      throw error;
    }
    const exists = Boolean(result?.data?.id)
      && (!result.data.status || result.data.status === "active")
      && (tokenVersion == null || Number(result.data.token_version) === Number(tokenVersion));
    if (canCache) cache.set(userId, { exists, expiresAt: now + ttlMs });
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
    const exists = await service.productUserExists(session.sub, session.ver);
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
