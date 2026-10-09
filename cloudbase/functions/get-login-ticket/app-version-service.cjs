function safeHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeMarketUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = value.trim();
  if (url.startsWith("market://")) return url;
  return safeHttpsUrl(url);
}

function createAppVersionService({ db } = {}) {
  if (!db || typeof db.from !== "function") throw new Error("App version database client is unavailable");
  return {
    async getLatest({ channel = "direct" } = {}) {
      const requestedChannel = channel === "market" ? "market" : "direct";
      const result = await db.from("app_releases")
        .select("platform,channel,version_code,version_name,apk_url,apk_sha256,market_url,release_notes")
        .eq("platform", "android")
        .in("channel", [requestedChannel, "all"])
        .eq("enabled", true)
        .order("version_code", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) {
        const error = new Error("App release lookup failed");
        if (typeof result.error.code === "string") error.code = result.error.code.slice(0, 64);
        throw error;
      }
      const row = result.data;
      if (!row) return { update: null };
      const apkUrl = safeHttpsUrl(row.apk_url);
      const apkSha256 = typeof row.apk_sha256 === "string" && /^[0-9a-f]{64}$/.test(row.apk_sha256)
        ? row.apk_sha256
        : null;
      const marketUrl = safeMarketUrl(row.market_url);
      if ((!apkUrl || !apkSha256) && !marketUrl) return { update: null };
      return {
        update: {
          platform: "android",
          channel: row.channel,
          versionCode: Number(row.version_code),
          versionName: String(row.version_name),
          ...(apkUrl && apkSha256 ? { apkUrl, apkSha256 } : {}),
          ...(marketUrl ? { marketUrl } : {}),
          releaseNotes: Array.isArray(row.release_notes)
            ? row.release_notes.filter((note) => typeof note === "string" && note.trim()).slice(0, 8)
            : [],
        },
      };
    },
  };
}

module.exports = { createAppVersionService };
