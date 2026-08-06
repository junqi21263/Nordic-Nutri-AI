function percentile95(values) {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function sumMetricRows(rows, metric) {
  return (rows ?? [])
    .filter((row) => row.metric === metric)
    .reduce((total, row) => total + Number(row.value ?? 0), 0);
}

function metricValues(rows, metric) {
  return (rows ?? [])
    .filter((row) => row.metric === metric)
    .map((row) => Number(row.value))
    .filter((value) => Number.isFinite(value));
}

function shanghaiDayKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function todayShanghaiKey() {
  return shanghaiDayKey(new Date().toISOString());
}

function enumerateDays(days) {
  const count = Math.min(90, Math.max(1, Number(days) || 14));
  const today = todayShanghaiKey();
  const end = new Date(`${today}T12:00:00+08:00`);
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(shanghaiDayKey(day.toISOString()));
  }
  return keys;
}

function buildDaySeries(dayKeys, rows, metrics) {
  const metricSet = new Set(Array.isArray(metrics) ? metrics : [metrics]);
  const totals = Object.fromEntries(dayKeys.map((key) => [key, 0]));
  for (const row of rows ?? []) {
    if (!metricSet.has(row.metric)) continue;
    const key = shanghaiDayKey(row.created_at || row.createdAt);
    if (!key || !(key in totals)) continue;
    totals[key] += Number(row.value ?? 0) || 0;
  }
  return dayKeys.map((date) => ({ date, value: totals[date] }));
}

function readMeta(row) {
  const meta = row?.meta;
  if (!meta) return {};
  if (typeof meta === "string") {
    try { return JSON.parse(meta) || {}; } catch { return {}; }
  }
  return typeof meta === "object" ? meta : {};
}

function rowModel(row) {
  const meta = readMeta(row);
  return typeof meta.model === "string" ? meta.model.trim() : "";
}

function rowFeature(row) {
  const meta = readMeta(row);
  return typeof meta.feature === "string" ? meta.feature.trim() : "";
}

const MODEL_REQUEST_METRICS = new Set([
  "vision_success",
  "vision_failure",
  "coach_message",
  "coach_limited",
  "rate_limited",
  "model_request",
]);

const MODEL_TOKEN_METRICS = new Set([
  "model_tokens",
  "model_tokens_input",
  "model_tokens_output",
]);

function createObservabilityService({ db }) {
  if (!db || typeof db.from !== "function") {
    throw new Error("Observability database is unavailable");
  }

  async function loadMetricRows({ sinceIso, limit = 5000 } = {}) {
    let query = db.from("ops_metric_events").select("metric,value,meta,created_at");
    if (sinceIso) query = query.gte("created_at", sinceIso);
    const result = await query
      .order("created_at", { ascending: false })
      .limit(Math.min(10000, Math.max(1, Number(limit) || 5000)));
    if (result?.error) throw new Error("Ops metrics read failed");
    return result.data ?? [];
  }

  async function recordMetric(metric, value = 1, meta = {}) {
    try {
      await db.from("ops_metric_events").insert({
        metric,
        value,
        meta: meta && typeof meta === "object" ? meta : {},
      });
    } catch (error) {
      console.warn("[observability] recordMetric failed:", metric, error?.message || error);
    }
  }

  async function getOverview({ hours = 24 } = {}) {
    const windowHours = Math.min(168, Math.max(1, Number(hours) || 24));
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const rows = await loadMetricRows({ sinceIso: since });
    const success = sumMetricRows(rows, "vision_success");
    const failure = sumMetricRows(rows, "vision_failure");
    const total = success + failure;
    return {
      windowHours,
      vision: {
        success,
        failure,
        failureRate: total ? failure / total : 0,
        p95Ms: percentile95(metricValues(rows, "vision_latency_ms")),
      },
      rateLimited: sumMetricRows(rows, "rate_limited"),
      accountCancel: {
        succeeded: sumMetricRows(rows, "account_cancel_success"),
        failed: sumMetricRows(rows, "account_cancel_failure"),
      },
      coach: {
        messages: sumMetricRows(rows, "coach_message"),
        limited: sumMetricRows(rows, "coach_limited"),
      },
      foodImage: null,
    };
  }

  async function getUsageReport({ days = 14 } = {}) {
    const dayKeys = enumerateDays(days);
    const sinceIso = new Date(`${dayKeys[0]}T00:00:00+08:00`).toISOString();
    const [windowRows, allRows] = await Promise.all([
      loadMetricRows({ sinceIso }),
      loadMetricRows({ limit: 10000 }),
    ]);
    const today = todayShanghaiKey();
    const todayRows = windowRows.filter((row) => shanghaiDayKey(row.created_at || row.createdAt) === today);

    const featureDefs = [
      { key: "vision", label: "食物识别", metrics: ["vision_success"] },
      { key: "coach", label: "营养教练", metrics: ["coach_message"] },
      { key: "rate_limited", label: "限流拦截", metrics: ["rate_limited"] },
      { key: "vision_failure", label: "识别失败", metrics: ["vision_failure"] },
      { key: "coach_limited", label: "教练限流", metrics: ["coach_limited"] },
    ];

    const features = featureDefs.map((def) => {
      const series = buildDaySeries(dayKeys, windowRows, def.metrics);
      return {
        key: def.key,
        label: def.label,
        today: sumMetricRows(todayRows, def.metrics[0]),
        windowTotal: series.reduce((sum, point) => sum + point.value, 0),
        total: sumMetricRows(allRows, def.metrics[0]),
        series,
      };
    });

    return {
      days: dayKeys.length,
      timezone: "Asia/Shanghai",
      today,
      features,
      series: dayKeys.map((date) => ({
        date,
        vision: features.find((item) => item.key === "vision")?.series.find((point) => point.date === date)?.value || 0,
        coach: features.find((item) => item.key === "coach")?.series.find((point) => point.date === date)?.value || 0,
        rateLimited: features.find((item) => item.key === "rate_limited")?.series.find((point) => point.date === date)?.value || 0,
        visionFailure: features.find((item) => item.key === "vision_failure")?.series.find((point) => point.date === date)?.value || 0,
      })),
    };
  }

  async function getModelDetail({ model, days = 30, catalog = [], foodImageSeries = [] } = {}) {
    const modelName = String(model || "").trim();
    if (!modelName) throw new Error("Model name is required");
    const dayKeys = enumerateDays(days);
    const sinceIso = new Date(`${dayKeys[0]}T00:00:00+08:00`).toISOString();
    const [windowRows, allRows] = await Promise.all([
      loadMetricRows({ sinceIso }),
      loadMetricRows({ limit: 10000 }),
    ]);

    const catalogEntries = (catalog || []).filter((entry) => entry?.model === modelName);
    const catalogFeatures = new Set(catalogEntries.map((entry) => entry.feature));
    const isFoodImageModel = catalogFeatures.has("food_image");
    const featureMetricMap = {
      vision: ["vision_success", "vision_failure"],
      coach: ["coach_message", "coach_limited"],
      daily_insight: ["daily_insight"],
      weekly_review: ["weekly_review"],
      nutrition_plan: ["nutrition_plan"],
      daily_tip: ["daily_tip"],
      food_image: [],
    };

    function rowBelongsToModel(row) {
      const explicit = rowModel(row);
      if (explicit) return explicit === modelName;
      const feature = rowFeature(row);
      if (feature && catalogFeatures.has(feature)) return true;
      // Attribute legacy rows that only have metric names, no meta.model.
      for (const [featureKey, metrics] of Object.entries(featureMetricMap)) {
        if (catalogFeatures.has(featureKey) && metrics.includes(row.metric)) return true;
      }
      return false;
    }

    const matchedWindow = windowRows.filter((row) => MODEL_REQUEST_METRICS.has(row.metric) && rowBelongsToModel(row));
    const matchedAll = allRows.filter((row) => MODEL_REQUEST_METRICS.has(row.metric) && rowBelongsToModel(row));
    const tokenWindow = windowRows.filter((row) => MODEL_TOKEN_METRICS.has(row.metric) && rowBelongsToModel(row));
    const tokenAll = allRows.filter((row) => MODEL_TOKEN_METRICS.has(row.metric) && rowBelongsToModel(row));

    let requestSeries = buildDaySeries(dayKeys, matchedWindow, [...MODEL_REQUEST_METRICS]);
    if (isFoodImageModel && Array.isArray(foodImageSeries) && foodImageSeries.length) {
      const byDate = Object.fromEntries(foodImageSeries.map((point) => [point.date, Number(point.value) || 0]));
      requestSeries = dayKeys.map((date) => ({
        date,
        value: (byDate[date] || 0) + (requestSeries.find((point) => point.date === date)?.value || 0),
      }));
    }

    const featureCounts = {};
    for (const row of matchedAll) {
      let feature = rowFeature(row);
      if (!feature) {
        feature = Object.entries(featureMetricMap).find(([, metrics]) => metrics.includes(row.metric))?.[0] || row.metric || "unknown";
      }
      featureCounts[feature] = (featureCounts[feature] || 0) + (Number(row.value) || 0);
    }
    for (const entry of catalogEntries) {
      if (!(entry.feature in featureCounts)) featureCounts[entry.feature] = 0;
    }
    if (isFoodImageModel) {
      const foodTotal = foodImageSeries.reduce((sum, point) => sum + (Number(point.value) || 0), 0);
      featureCounts.food_image = (featureCounts.food_image || 0) + foodTotal;
    }

    const today = todayShanghaiKey();
    const requestWindow = requestSeries.reduce((sum, point) => sum + point.value, 0);
    const requestToday = requestSeries.find((point) => point.date === today)?.value || 0;
    // Prefer window sum for "total" display when all-time sample is capped; keep both.
    const requestAllTime = matchedAll.reduce((sum, row) => sum + (Number(row.value) || 0), 0)
      + (isFoodImageModel ? foodImageSeries.reduce((sum, point) => sum + (Number(point.value) || 0), 0) : 0);
    const requestTotal = Math.max(requestWindow, requestAllTime);

    const tokensInputSeries = buildDaySeries(dayKeys, tokenWindow, ["model_tokens_input"]);
    const tokensOutputSeries = buildDaySeries(dayKeys, tokenWindow, ["model_tokens_output"]);
    const tokensTotalSeries = dayKeys.map((date) => {
      const explicit = tokenWindow
        .filter((row) => shanghaiDayKey(row.created_at || row.createdAt) === date && row.metric === "model_tokens")
        .reduce((sum, row) => sum + (Number(row.value) || 0), 0);
      const input = tokensInputSeries.find((point) => point.date === date)?.value || 0;
      const output = tokensOutputSeries.find((point) => point.date === date)?.value || 0;
      return { date, value: explicit || (input + output), input, output };
    });
    const tokensWindow = tokensTotalSeries.reduce((sum, point) => sum + point.value, 0);
    const tokensTotal = Math.max(tokensWindow, tokenAll.reduce((sum, row) => sum + (Number(row.value) || 0), 0));

    const featureLabel = Object.fromEntries(
      (catalog || []).map((entry) => [entry.feature, entry.featureLabel || entry.feature]),
    );

    return {
      model: modelName,
      provider: catalogEntries[0]?.provider || null,
      days: dayKeys.length,
      today,
      timezone: "Asia/Shanghai",
      features: catalogEntries.map((entry) => ({
        feature: entry.feature,
        featureLabel: entry.featureLabel || entry.feature,
        dailyLimit: entry.dailyLimit ?? null,
        burstLimit: entry.burstLimit ?? null,
      })),
      requests: {
        today: requestToday,
        windowTotal: requestWindow,
        total: requestTotal,
        series: requestSeries,
      },
      tokens: {
        today: tokensTotalSeries.find((point) => point.date === today)?.value || 0,
        windowTotal: tokensWindow,
        total: tokensTotal,
        series: tokensTotalSeries,
        tracked: tokensTotal > 0 || tokensTotalSeries.some((point) => point.value > 0),
        applicable: !isFoodImageModel,
      },
      byFeature: Object.entries(featureCounts)
        .map(([feature, count]) => ({
          feature,
          featureLabel: featureLabel[feature] || feature,
          count,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  async function getModelBoard({ days = 30, catalog = [], foodImageSeries = [] } = {}) {
    const uniqueModels = [];
    const seen = new Set();
    for (const entry of catalog || []) {
      const name = String(entry?.model || "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      uniqueModels.push(name);
    }
    const boards = [];
    for (const modelName of uniqueModels) {
      boards.push(await getModelDetail({
        model: modelName,
        days,
        catalog,
        foodImageSeries,
      }));
    }
    return {
      days: Math.min(90, Math.max(1, Number(days) || 30)),
      today: todayShanghaiKey(),
      timezone: "Asia/Shanghai",
      models: boards,
    };
  }

  async function listDeletionLog({ limit = 50 } = {}) {
    const capped = Math.min(200, Math.max(1, Number(limit) || 50));
    const result = await db
      .from("ops_account_deletion_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(capped);
    if (result?.error) throw new Error("Deletion log read failed");
    return result.data ?? [];
  }

  async function recordDeletion({ userId, clientRequestId, outcome, errorCode = null }) {
    try {
      await db.from("ops_account_deletion_log").insert({
        user_id: userId,
        client_request_id: clientRequestId,
        outcome,
        error_code: errorCode,
      });
    } catch (error) {
      console.warn("[observability] recordDeletion failed:", outcome, error?.message || error);
    }
  }

  async function purgeExpiredDeletionLogs({ now = new Date() } = {}) {
    const result = await db
      .from("ops_account_deletion_log")
      .delete()
      .lt("expires_at", now.toISOString());
    if (result?.error) throw new Error("Deletion log retention purge failed");
    return { deleted: result?.data?.length || 0 };
  }

  return {
    recordMetric,
    getOverview,
    getUsageReport,
    getModelDetail,
    getModelBoard,
    listDeletionLog,
    recordDeletion,
    purgeExpiredDeletionLogs,
  };
}

module.exports = {
  createObservabilityService,
  percentile95,
  shanghaiDayKey,
  todayShanghaiKey,
  enumerateDays,
  buildDaySeries,
};
