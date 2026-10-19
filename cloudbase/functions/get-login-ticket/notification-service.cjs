const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class NotificationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function checked(result) {
  if (result.error) throw new NotificationError("NOTIFICATION_DATABASE_FAILED");
  return result.data;
}
function rpcValue(result, name) {
  const data = checked(result);
  if (
    Array.isArray(data) &&
    data.length === 1 &&
    data[0] &&
    Object.hasOwn(data[0], name)
  )
    return data[0][name];
  if (data && typeof data === "object" && Object.hasOwn(data, name))
    return data[name];
  return data;
}
function id(value) {
  if (!UUID.test(String(value || "")))
    throw new NotificationError("NOTIFICATION_ID_INVALID");
  return value;
}
function announcementInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new NotificationError("ANNOUNCEMENT_CONTENT_INVALID");
  const text = (key, max) => {
    const value = typeof input[key] === "string" ? input[key].trim() : "";
    if (!value || value.length > max)
      throw new NotificationError("ANNOUNCEMENT_CONTENT_INVALID");
    return value;
  };
  if (!["all", "selected"].includes(input.audience))
    throw new NotificationError("ANNOUNCEMENT_AUDIENCE_INVALID");
  const recipients = input.audience === "selected" ? input.recipientIds : [];
  if (
    !Array.isArray(recipients) ||
    recipients.length > 500 ||
    (input.audience === "selected" && !recipients.length)
  )
    throw new NotificationError("ANNOUNCEMENT_RECIPIENT_INVALID");
  recipients.forEach(id);
  if (typeof input.pushEnabled !== "boolean")
    throw new NotificationError("ANNOUNCEMENT_PUSH_INVALID");
  return {
    title: text("title", 80),
    summary: text("summary", 200),
    body: text("body", 10000),
    audience: input.audience,
    recipient_ids: [...new Set(recipients)],
    push_enabled: input.pushEnabled,
  };
}
function createNotificationService({ db, push, isAdmin }) {
  const admin = async (actor) => {
    if (!actor || !(await isAdmin(actor)))
      throw new NotificationError("FORBIDDEN");
  };
  async function list(userId, { offset = 0, kind } = {}) {
    const start = Number(offset || 0);
    if (!Number.isSafeInteger(start) || start < 0 || start > 1000000) throw new NotificationError("NOTIFICATION_OFFSET_INVALID");
    let q = db
      .from("user_notifications")
      .select(
        "id,kind,title,body,announcement_id,feedback_id,read_at,created_at",
        { count: "exact" },
      )
      .eq("user_id", userId)
      .is("withdrawn_at", null)
      .order("created_at", { ascending: false })
      .range(start, start + 29);
    if (kind) {
      if (!["system", "feedback"].includes(kind))
        throw new NotificationError("NOTIFICATION_KIND_INVALID");
      q = q.eq("kind", kind);
    }
    const result = await q;
    const items = checked(result) || [];
    const unread = await db
      .from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("withdrawn_at", null)
      .is("read_at", null);
    checked(unread);
    return { items, total: result.count || 0, unreadCount: unread.count || 0 };
  }
  async function detail(userId, notificationId) {
    const n = checked(
      await db
        .from("user_notifications")
        .select("*")
        .eq("id", id(notificationId))
        .eq("user_id", userId)
        .is("withdrawn_at", null)
        .maybeSingle(),
    );
    if (!n) throw new NotificationError("NOTIFICATION_NOT_FOUND");
    if (n.announcement_id) {
      const a = checked(
        await db
          .from("system_announcements")
          .select("body,status")
          .eq("id", n.announcement_id)
          .maybeSingle(),
      );
      if (!a || a.status !== "published")
        throw new NotificationError("NOTIFICATION_NOT_FOUND");
      n.body = a.body;
    }
    if (n.feedback_id) {
      const f = checked(
        await db
          .from("user_feedback")
          .select("content,admin_reply,replied_at")
          .eq("id", n.feedback_id)
          .eq("user_id", userId)
          .maybeSingle(),
      );
      if (!f) throw new NotificationError("NOTIFICATION_NOT_FOUND");
      n.feedback = f;
    }
    return n;
  }
  async function preferences(userId, input) {
    if (input !== undefined) {
      if (
        !input ||
        typeof input.systemPush !== "boolean" ||
        typeof input.feedbackPush !== "boolean"
      )
        throw new NotificationError("NOTIFICATION_PREFERENCES_INVALID");
      checked(
        await db
          .from("notification_preferences")
          .upsert(
            {
              user_id: userId,
              system_push: input.systemPush,
              feedback_push: input.feedbackPush,
            },
            { onConflict: "user_id" },
          ),
      );
    }
    const row = checked(
      await db
        .from("notification_preferences")
        .select("system_push,feedback_push")
        .eq("user_id", userId)
        .maybeSingle(),
    );
    return {
      systemPush: row?.system_push ?? true,
      feedbackPush: row?.feedback_push ?? true,
    };
  }
  async function dispatch(limit = 5) {
    const messages =
      checked(await db.rpc("claim_notification_pushes", { p_limit: limit })) ||
      [];
    const results = [];
    for (const n of messages) {
      let patch;
      try {
        const latest = checked(
          await db
            .from("user_notifications")
            .select("read_at,withdrawn_at,push_status")
            .eq("id", n.id)
            .single(),
        );
        const prefs = await preferences(n.user_id);
        if (
          latest.read_at ||
          latest.withdrawn_at ||
          latest.push_status !== "sending" ||
          !(n.kind === "feedback" ? prefs.feedbackPush : prefs.systemPush)
        )
          patch = { push_status: "skipped", push_error: null };
        else {
          const result = await push.sendNotification({
            userId: n.user_id,
            notificationId: n.id,
            generation: n.push_generation,
            kind: n.kind,
            copy: {
              title: n.kind === "feedback" ? "你的反馈有新回复" : n.title,
              body:
                n.kind === "feedback"
                  ? "Nordic 已回复你提交的问题，点此查看。"
                  : n.body,
            },
          });
          patch = {
            push_status: result.accepted > 0 ? "accepted" : "skipped",
            push_error: result.accepted > 0 ? null : "NO_ACTIVE_TOKEN",
          };
        }
      } catch (error) {
        patch = {
          push_status: n.push_attempts >= 3 ? "failed" : "pending",
          push_error: String(error.code || "PUSH_FAILED").slice(0, 100),
          next_attempt_at: new Date(
            Date.now() + 60000 * n.push_attempts,
          ).toISOString(),
        };
      }
      checked(
        await db
          .from("user_notifications")
          .update(patch)
          .eq("id", n.id)
          .eq("push_status", "sending")
          .eq("push_generation", n.push_generation),
      );
      results.push({ id: n.id, status: patch.push_status });
    }
    return { processed: results.length, items: results };
  }
  return {
    list,
    detail,
    preferences,
    dispatch,
    async read(userId, notificationId) {
      const read = rpcValue(
        await db.rpc("mark_notification_read", {
          p_id: id(notificationId),
          p_user: userId,
        }),
        "mark_notification_read",
      );
      if (read !== true) throw new NotificationError("NOTIFICATION_NOT_FOUND");
      return { read: true };
    },
    async adminList(actor) {
      await admin(actor);
      return {
        items:
          checked(
            await db
              .from("system_announcements")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(100),
          ) || [],
      };
    },
    async save(actor, announcementId, input) {
      await admin(actor);
      const patch = {
        ...announcementInput(input),
        updated_by: actor,
        updated_at: new Date().toISOString(),
      };
      if (announcementId) {
        const old = checked(
          await db
            .from("system_announcements")
            .select("status,audience,recipient_ids")
            .eq("id", id(announcementId))
            .single(),
        );
        if (
          old.status !== "draft" &&
          (old.audience !== patch.audience ||
            JSON.stringify([...old.recipient_ids].sort()) !==
              JSON.stringify([...patch.recipient_ids].sort()))
        )
          throw new NotificationError("ANNOUNCEMENT_AUDIENCE_LOCKED");
      }
      const q = announcementId
        ? db.from("system_announcements").update(patch).eq("id", announcementId)
        : db
            .from("system_announcements")
            .insert({ ...patch, created_by: actor });
      return checked(await q.select("*").single());
    },
    async act(actor, announcementId, action) {
      await admin(actor);
      if (!["publish", "remind", "retract"].includes(action))
        throw new NotificationError("ANNOUNCEMENT_ACTION_INVALID");
      const result = await db.rpc("publish_system_announcement", {
        p_id: id(announcementId),
        p_actor: actor,
        p_action: action,
      });
      if (result.error)
        throw new NotificationError("ANNOUNCEMENT_ACTION_FAILED");
      return rpcValue(result, "publish_system_announcement");
    },
    async stats(actor, announcementId) {
      await admin(actor);
      return rpcValue(
        await db.rpc("notification_announcement_stats", {
          p_id: id(announcementId),
        }),
        "notification_announcement_stats",
      );
    },
    async feedbackPush(actor, feedbackId, retry = false) {
      await admin(actor);
      id(feedbackId);
      if (retry)
        checked(
          await db
            .from("user_notifications")
            .update({
              push_status: "pending",
              push_attempts: 0,
              push_error: null,
              next_attempt_at: new Date().toISOString(),
            })
            .eq("feedback_id", feedbackId)
            .eq("push_status", "failed")
            .is("read_at", null),
        );
      return {
        item: checked(
          await db
            .from("user_notifications")
            .select("id,push_status,push_error,read_at")
            .eq("feedback_id", feedbackId)
            .maybeSingle(),
        ),
      };
    },
    async retry(actor, announcementId) {
      await admin(actor);
      checked(
        await db
          .from("user_notifications")
          .update({
            push_status: "pending",
            push_attempts: 0,
            push_error: null,
            next_attempt_at: new Date().toISOString(),
          })
          .eq("announcement_id", id(announcementId))
          .eq("push_status", "failed")
          .is("withdrawn_at", null)
          .is("read_at", null),
      );
      return { queued: true };
    },
  };
}
module.exports = {
  createNotificationService,
  NotificationError,
  announcementInput,
};
