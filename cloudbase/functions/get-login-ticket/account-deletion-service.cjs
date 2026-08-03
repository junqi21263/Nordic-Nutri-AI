class PublicAccountDeletionError extends Error {
  constructor(code, message = "账号注销暂时无法完成") {
    super(message);
    this.code = code;
  }
}

const CONFIRMATION = "DELETE_MY_NORDIC_NUTRI_ACCOUNT";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function appendPaths(target, rows, key) {
  for (const row of rows || []) {
    const value = row?.[key];
    if (typeof value === "string" && value && !value.startsWith("data:")) target.add(value);
  }
}

function createAccountDeletionService({ db, deleteFiles, operationGuard = null }) {
  if (!db || typeof db.from !== "function" || typeof deleteFiles !== "function") {
    throw new Error("Account deletion dependencies are unavailable");
  }

  async function rows(table, column, userColumn, userId) {
    const result = await db.from(table).select(column).eq(userColumn, userId);
    // Image/asset tables were introduced incrementally. A missing optional table
    // must not prevent the product account itself from being physically deleted.
    if (result?.error) {
      const message = result.error?.message || result.error?.code || "unknown";
      console.warn(`[account-cancellation] optional ${table} lookup skipped:`, message);
      return [];
    }
    return result?.data || [];
  }

  return {
    async cancelAccount(userId, input) {
      if (!userId || typeof userId !== "string") throw new PublicAccountDeletionError("UNAUTHORIZED");
      if (input?.confirmation !== CONFIRMATION) {
        throw new PublicAccountDeletionError("ACCOUNT_CANCELLATION_CONFIRMATION_REQUIRED", "请完成账号注销确认");
      }
      if (typeof input?.clientRequestId !== "string" || !uuidPattern.test(input.clientRequestId)) {
        throw new PublicAccountDeletionError("ACCOUNT_CANCELLATION_REQUEST_INVALID", "注销请求无效，请重试");
      }

      if (operationGuard) {
        try {
          const prior = await operationGuard.claim(userId, "account_cancel", input.clientRequestId);
          if (prior.reused) return prior.response;
        } catch (error) {
          if (error?.code === "OPERATION_IN_PROGRESS") throw error;
          console.error("[account-cancellation] operation guard unavailable; continuing safely:", error?.message || error);
        }
      }

      try {
      const [assets, profiles, analyses, meals] = await Promise.all([
        rows("uploaded_assets", "object_path", "user_id", userId),
        rows("profiles", "avatar_path", "id", userId),
        rows("ai_analysis", "image_path", "user_id", userId),
        rows("meal_records", "image_path", "user_id", userId),
      ]);
      const paths = new Set();
      appendPaths(paths, assets, "object_path");
      appendPaths(paths, profiles, "avatar_path");
      appendPaths(paths, analyses, "image_path");
      appendPaths(paths, meals, "image_path");
      if (paths.size) await deleteFiles({ cloudPaths: [...paths] });

      const deleted = await db.from("app_users").delete().eq("id", userId);
      if (deleted?.error) throw new Error("Account deletion database removal failed");
      return { deleted: true };
      } catch (error) {
        if (operationGuard) {
          try {
            await operationGuard.fail(userId, "account_cancel", input.clientRequestId, error?.code || "ACCOUNT_CANCELLATION_FAILED");
          } catch (guardError) {
            console.error("[account-cancellation] unable to mark failed operation:", guardError?.message || guardError);
          }
        }
        throw error;
      }
    },
  };
}

module.exports = { CONFIRMATION, PublicAccountDeletionError, createAccountDeletionService };
