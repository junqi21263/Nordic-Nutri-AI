const FEEDBACK_STATUSES = new Set(["new", "reviewing", "resolved", "closed"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AdminConsoleError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function createAdminConsoleService({ db, isAdmin }) {
  if (!db?.from || typeof isAdmin !== "function") throw new Error("Admin console deps missing");

  async function requireAdmin(userId) {
    if (!userId) throw new AdminConsoleError("UNAUTHORIZED");
    if (!(await isAdmin(userId))) throw new AdminConsoleError("FORBIDDEN");
  }

  function mapUser(row, profile) {
    return {
      id: row.id,
      nickname: profile?.nickname ?? null,
      isAdmin: Boolean(row.is_admin),
      lastLoginAt: profile?.last_login_at ?? null,
      registrationChannel: row.registration_channel ?? null,
      createdAt: row.created_at,
    };
  }

  function mapFeedback(row, nickname) {
    return {
      id: row.id,
      userId: row.user_id,
      nickname: nickname ?? null,
      category: row.category,
      content: row.content,
      status: row.status,
      adminReply: row.admin_reply ?? null,
      repliedAt: row.replied_at ?? null,
      replyReadAt: row.reply_read_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function updateFeedback(userId, feedbackId, { status, reply } = {}) {
    await requireAdmin(userId);
    if (!UUID_RE.test(String(feedbackId || ""))) throw new AdminConsoleError("FEEDBACK_NOT_FOUND");
    const hasStatus = status !== undefined;
    const hasReply = reply !== undefined;
    if (!hasStatus && !hasReply) throw new AdminConsoleError("FEEDBACK_UPDATE_INVALID");
    if (hasStatus && !FEEDBACK_STATUSES.has(status)) throw new AdminConsoleError("FEEDBACK_STATUS_INVALID");

    const patch = hasStatus ? { status } : {};
    if (hasReply) {
      if (typeof reply !== "string") throw new AdminConsoleError("FEEDBACK_REPLY_INVALID");
      const normalizedReply = reply.trim();
      if (!normalizedReply || normalizedReply.length > 2000) throw new AdminConsoleError("FEEDBACK_REPLY_INVALID");
      patch.admin_reply = normalizedReply;
      patch.replied_at = new Date().toISOString();
      patch.reply_read_at = null;
      patch.status = "resolved";
    }
    const result = await db
      .from("user_feedback")
      .update(patch)
      .eq("id", feedbackId)
      .select("id,user_id,category,content,status,admin_reply,created_at,replied_at,reply_read_at,updated_at")
      .single();
    if (result.error || !result.data) throw new AdminConsoleError("FEEDBACK_NOT_FOUND");
    const profile = await db.from("profiles").select("nickname").eq("id", result.data.user_id).maybeSingle();
    return mapFeedback(result.data, profile.data?.nickname);
  }

  return {
    async listUsers(userId, { q = "", limit = 50 } = {}) {
      await requireAdmin(userId);
      const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const query = String(q || "").trim();

      let profileIds = null;
      if (query && !UUID_RE.test(query)) {
        const profileResult = await db.from("profiles").select("id,nickname,last_login_at").ilike("nickname", `%${query}%`);
        if (profileResult.error) throw new AdminConsoleError("USERS_LIST_FAILED");
        profileIds = (profileResult.data || []).map((p) => p.id);
        if (!profileIds.length) return { items: [], nextCursor: null };
      }

      let userQuery = db
        .from("app_users")
        .select("id,is_admin,status,registration_channel,created_at")
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(cap);
      if (UUID_RE.test(query)) userQuery = userQuery.eq("id", query);
      else if (profileIds) userQuery = userQuery.in("id", profileIds);

      const usersResult = await userQuery;
      if (usersResult.error) throw new AdminConsoleError("USERS_LIST_FAILED");
      const users = usersResult.data || [];
      const ids = users.map((u) => u.id);
      const profilesResult = ids.length
        ? await db.from("profiles").select("id,nickname,last_login_at").in("id", ids)
        : { data: [], error: null };
      if (profilesResult.error) throw new AdminConsoleError("USERS_LIST_FAILED");
      const profileMap = new Map((profilesResult.data || []).map((p) => [p.id, p]));
      return { items: users.map((u) => mapUser(u, profileMap.get(u.id))), nextCursor: null };
    },

    async listFeedback(userId, { status, limit = 50 } = {}) {
      await requireAdmin(userId);
      const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
      let query = db
        .from("user_feedback")
        .select("id,user_id,category,content,status,admin_reply,created_at,replied_at,reply_read_at,updated_at,client_request_id,device_context")
        .order("created_at", { ascending: false })
        .limit(cap);
      if (status) {
        if (!FEEDBACK_STATUSES.has(status)) throw new AdminConsoleError("FEEDBACK_STATUS_INVALID");
        query = query.eq("status", status);
      }
      const result = await query;
      if (result.error) throw new AdminConsoleError("FEEDBACK_LIST_FAILED");
      const mirroredIds = (result.data || [])
        .filter((row) => row.device_context?.source === "recognition_feedback" && row.client_request_id)
        .map((row) => row.client_request_id);
      const writtenOtherIds = new Set();
      if (mirroredIds.length) {
        const recognition = await db.from("recognition_feedback")
          .select("id,feedback_type,corrected_result")
          .in("id", mirroredIds);
        if (recognition.error) throw new AdminConsoleError("FEEDBACK_LIST_FAILED");
        for (const row of recognition.data || []) {
          if (row.feedback_type === "other" && typeof row.corrected_result?.note === "string" && row.corrected_result.note.trim()) {
            writtenOtherIds.add(row.id);
          }
        }
      }
      const rows = (result.data || []).filter((row) => row.device_context?.source !== "recognition_feedback"
        || writtenOtherIds.has(row.client_request_id));
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const profilesResult = ids.length
        ? await db.from("profiles").select("id,nickname").in("id", ids)
        : { data: [], error: null };
      if (profilesResult.error) throw new AdminConsoleError("FEEDBACK_LIST_FAILED");
      const nickMap = new Map((profilesResult.data || []).map((p) => [p.id, p.nickname]));
      return { items: rows.map((r) => mapFeedback(r, nickMap.get(r.user_id))), nextCursor: null };
    },

    updateFeedback,
    async updateFeedbackStatus(userId, feedbackId, { status } = {}) {
      return updateFeedback(userId, feedbackId, { status });
    },
  };
}

module.exports = { createAdminConsoleService, AdminConsoleError };
