const USER_ID_MAX = 128;

class UserOpsError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function boundedUserId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return id && id.length <= USER_ID_MAX ? id : null;
}

function latestAt(rows, field = "created_at") {
  return (rows || [])
    .map((row) => row?.[field] || row?.created_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
}

function mapFeedback(row) {
  return {
    id: row.id,
    category: row.category || null,
    status: row.status || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapModeration(row) {
  return {
    id: row.id,
    source: row.source || null,
    status: row.status || null,
    createdAt: row.created_at || null,
    reviewedAt: row.reviewed_at || null,
  };
}

function mapDeletion(row) {
  return {
    id: row.id,
    outcome: row.outcome || null,
    errorCode: row.error_code || null,
    createdAt: row.created_at || null,
  };
}

function mapTraceEvent(trace) {
  return {
    type: trace.feature === "vision" ? "vision" : "ai_request",
    occurredAt: trace.startedAt || null,
    status: trace.status || null,
    durationMs: Number.isFinite(Number(trace.durationMs)) ? Number(trace.durationMs) : null,
    errorCode: trace.errorCode || null,
    resourceId: null,
    traceId: trace.traceId || null,
  };
}

function traceMapByClientRequestId(traces) {
  return new Map((traces || [])
    .filter((trace) => trace?.clientRequestId && trace?.traceId)
    .map((trace) => [trace.clientRequestId, trace.traceId]));
}

function createUserOpsService({ db, isAdmin, hashUserId, listTraces } = {}) {
  if (!db?.from || typeof isAdmin !== "function") throw new Error("User ops dependencies are unavailable");

  async function requireAdmin(adminUserId) {
    if (!adminUserId) throw new UserOpsError("UNAUTHORIZED");
    if (!(await isAdmin(adminUserId))) throw new UserOpsError("FORBIDDEN");
  }

  async function queryRows(table, columns, userId, { limit = 500 } = {}) {
    let query = db.from(table).select(columns).eq("user_id", userId).limit(limit);
    const result = await query;
    if (result?.error) throw new Error(`${table} query failed`);
    return result?.data || [];
  }

  async function loadSources(userId) {
    const [meals, analyses, coachMessages, images, feedback, moderation, deletion] = await Promise.all([
      queryRows("meal_records", "id,client_request_id,recorded_at,deleted_at", userId),
      queryRows("ai_analysis", "id,client_request_id,status,provider,created_at", userId),
      queryRows("coach_messages", "id,client_request_id,role,provider,created_at", userId),
      queryRows("uploaded_assets", "id,status,created_at", userId),
      queryRows("user_feedback", "id,category,status,created_at,updated_at", userId, { limit: 100 }),
      queryRows("content_moderation_flags", "id,source,status,created_at,reviewed_at", userId, { limit: 100 }),
      queryRows("ops_account_deletion_log", "id,outcome,error_code,created_at", userId, { limit: 100 }),
    ]);
    let traces = [];
    if (typeof listTraces === "function" && typeof hashUserId === "function") {
      try {
        const traceResult = await listTraces({ userHash: hashUserId(userId), page: 1, limit: 200 });
        traces = traceResult?.items || [];
      } catch {
        traces = [];
      }
    }
    return { meals, analyses, coachMessages, images, feedback, moderation, deletion, traces };
  }

  async function loadIdentity(userId) {
    const userResult = await db.from("app_users").select("id,status,created_at,updated_at").eq("id", userId).maybeSingle();
    if (userResult?.error) throw new UserOpsError("USER_DETAIL_FAILED");
    if (!userResult?.data) throw new UserOpsError("USER_NOT_FOUND");
    const profileResult = await db.from("profiles").select("id,nickname,last_login_at,onboarding_completed_at").eq("id", userId).maybeSingle();
    if (profileResult?.error) throw new UserOpsError("USER_DETAIL_FAILED");
    return { user: userResult.data, profile: profileResult.data || null };
  }

  function mapDetail(identity, sources) {
    const { user, profile } = identity;
    const activeMeals = sources.meals.filter((row) => !row.deleted_at);
    const providers = [...new Set([
      ...sources.analyses.map((row) => row.provider),
      ...sources.coachMessages.map((row) => row.provider),
      ...sources.traces.map((row) => row.provider),
    ].filter(Boolean))];
    return {
      id: user.id,
      profile: {
        nickname: profile?.nickname || null,
        createdAt: user.created_at || null,
        lastActiveAt: profile?.last_login_at || user.updated_at || null,
        onboardingCompletedAt: profile?.onboarding_completed_at || null,
        status: user.status || null,
      },
      overview: {
        mealsCount: activeMeals.length,
        aiUsageCount: sources.analyses.length + sources.coachMessages.filter((row) => row.role === "assistant").length,
        imageCount: sources.images.length,
        feedbackCount: sources.feedback.length,
        moderationCount: sources.moderation.length,
        deletionCount: sources.deletion.length,
        lastEventAt: latestAt([
          ...sources.meals,
          ...sources.analyses,
          ...sources.coachMessages,
          ...sources.images,
          ...sources.feedback,
          ...sources.moderation,
          ...sources.deletion,
        ]),
      },
      meals: {
        count: activeMeals.length,
        lastRecordedAt: latestAt(activeMeals, "recorded_at"),
      },
      aiUsage: {
        visionCount: sources.analyses.length,
        coachMessageCount: sources.coachMessages.filter((row) => row.role === "assistant").length,
        totalTraceCount: sources.traces.length,
        providers,
        lastAt: latestAt([...sources.analyses, ...sources.coachMessages, ...sources.traces], "startedAt"),
      },
      images: {
        count: sources.images.length,
        readyCount: sources.images.filter((row) => ["attached", "ready"].includes(row.status)).length,
        lastAt: latestAt(sources.images),
      },
      feedback: { count: sources.feedback.length, items: sources.feedback.map(mapFeedback) },
      moderation: { count: sources.moderation.length, items: sources.moderation.map(mapModeration) },
      deletion: { count: sources.deletion.length, items: sources.deletion.map(mapDeletion) },
    };
  }

  function buildTimeline(sources) {
    const traceIds = traceMapByClientRequestId(sources.traces);
    const items = [
      ...sources.traces.map(mapTraceEvent),
      ...sources.meals.map((row) => ({ type: "meal", occurredAt: row.recorded_at || null, status: row.deleted_at ? "deleted" : "active", durationMs: null, errorCode: null, resourceId: row.id, traceId: traceIds.get(row.client_request_id) || null })),
      ...sources.analyses.map((row) => ({ type: "vision", occurredAt: row.created_at || null, status: row.status || null, durationMs: null, errorCode: null, resourceId: row.id, traceId: traceIds.get(row.client_request_id) || null })),
      ...sources.coachMessages.filter((row) => row.role === "assistant").map((row) => ({ type: "coach", occurredAt: row.created_at || null, status: "completed", durationMs: null, errorCode: null, resourceId: row.id, traceId: traceIds.get(row.client_request_id) || null })),
      ...sources.images.map((row) => ({ type: "image", occurredAt: row.created_at || null, status: row.status || null, durationMs: null, errorCode: null, resourceId: row.id, traceId: null })),
      ...sources.feedback.map((row) => ({ type: "feedback", occurredAt: row.created_at || null, status: row.status || null, durationMs: null, errorCode: null, resourceId: row.id, traceId: null })),
      ...sources.moderation.map((row) => ({ type: "moderation", occurredAt: row.created_at || null, status: row.status || null, durationMs: null, errorCode: null, resourceId: row.id, traceId: null })),
      ...sources.deletion.map((row) => ({ type: "deletion", occurredAt: row.created_at || null, status: row.outcome || null, durationMs: null, errorCode: row.error_code || null, resourceId: row.id, traceId: null })),
    ];
    items.sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime());
    return items.slice(0, 500);
  }

  return {
    async getUserDetail(adminUserId, userId) {
      await requireAdmin(adminUserId);
      const safeUserId = boundedUserId(userId);
      if (!safeUserId) throw new UserOpsError("USER_NOT_FOUND");
      const [identity, sources] = await Promise.all([loadIdentity(safeUserId), loadSources(safeUserId)]);
      return mapDetail(identity, sources);
    },
    async getUserTimeline(adminUserId, userId) {
      await requireAdmin(adminUserId);
      const safeUserId = boundedUserId(userId);
      if (!safeUserId) throw new UserOpsError("USER_NOT_FOUND");
      const [identity, sources] = await Promise.all([loadIdentity(safeUserId), loadSources(safeUserId)]);
      return { userId: identity.user.id, items: buildTimeline(sources) };
    },
  };
}

module.exports = { createUserOpsService, UserOpsError };

