class PublicAccountDeletionError extends Error {
  constructor(code, message = "账号注销暂时无法完成") {
    super(message);
    this.code = code;
  }
}

const CONFIRMATION = "DELETE_MY_NORDIC_NUTRI_ACCOUNT";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GUARD_TIMEOUT_MS = 2_500;
const LOOKUP_TIMEOUT_MS = 4_000;
const STORAGE_TIMEOUT_MS = 8_000;

function withTimeout(promise, ms, onTimeout) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(onTimeout instanceof Error ? onTimeout : new Error(onTimeout || "timeout")), ms);
    }),
  ]);
}

function isDeletableStoragePath(value) {
  if (typeof value !== "string") return false;
  const path = value.trim();
  if (!path) return false;
  // Virtual / remote display refs are never CloudBase file IDs.
  if (path.startsWith("data:") || path.startsWith("default:") || /^https?:\/\//i.test(path)) return false;
  return true;
}

function appendPaths(target, rows, key) {
  for (const row of rows || []) {
    const value = row?.[key];
    if (isDeletableStoragePath(value)) target.add(value.trim());
  }
}

function isMissingOptionalTableError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  return code === "PGRST205" || /could not find (the )?table|relation .* does not exist|schema cache/i.test(message);
}

function createAccountDeletionService({ db, deleteFiles, operationGuard = null, onStorageCleanupFailed = null }) {
  if (!db || typeof db.from !== "function" || typeof deleteFiles !== "function") {
    throw new Error("Account deletion dependencies are unavailable");
  }

  async function rows(table, column, userColumn, userId) {
    try {
      const result = await withTimeout(
        db.from(table).select(column).eq(userColumn, userId),
        LOOKUP_TIMEOUT_MS,
        `optional ${table} lookup timed out`,
      );
      if (result?.error) {
        const message = result.error?.message || result.error?.code || "unknown";
        if (isMissingOptionalTableError(result.error)) {
          console.warn(`[account-cancellation] optional ${table} table is unavailable:`, message);
          return [];
        }
        throw new PublicAccountDeletionError("ACCOUNT_CANCELLATION_ASSET_LOOKUP_FAILED", "无法读取待删除文件，账号尚未注销，请稍后重试");
      }
      return result?.data || [];
    } catch (error) {
      if (error instanceof PublicAccountDeletionError) throw error;
      if (isMissingOptionalTableError(error)) {
        console.warn(`[account-cancellation] optional ${table} table is unavailable:`, error?.message || error);
        return [];
      }
      throw new PublicAccountDeletionError("ACCOUNT_CANCELLATION_ASSET_LOOKUP_FAILED", "无法读取待删除文件，账号尚未注销，请稍后重试");
    }
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
          const prior = await withTimeout(
            operationGuard.claim(userId, "account_cancel", input.clientRequestId),
            GUARD_TIMEOUT_MS,
            "operation guard claim timed out",
          );
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
        if (paths.size) {
          try {
            await withTimeout(
              deleteFiles({ cloudPaths: [...paths] }),
              STORAGE_TIMEOUT_MS,
              "storage cleanup timed out",
            );
          } catch (error) {
            console.error("[account-cancellation] storage cleanup failed:", error?.message || error);
            if (typeof onStorageCleanupFailed === "function") {
              try {
                await onStorageCleanupFailed({
                  userId,
                  clientRequestId: input.clientRequestId,
                  pathCount: paths.size,
                  reason: error?.message || String(error),
                });
              } catch (auditError) {
                console.error("[account-cancellation] storage cleanup audit failed:", auditError?.message || auditError);
              }
            }
            throw new PublicAccountDeletionError(
              "ACCOUNT_CANCELLATION_STORAGE_CLEANUP_FAILED",
              "文件清理失败，账号尚未注销，请稍后重试",
            );
          }
        }

        const deleted = await db.from("app_users").delete().eq("id", userId);
        if (deleted?.error) throw new Error("Account deletion database removal failed");
        return { deleted: true };
      } catch (error) {
        if (operationGuard) {
          try {
            await withTimeout(
              operationGuard.fail(userId, "account_cancel", input.clientRequestId, error?.code || "ACCOUNT_CANCELLATION_FAILED"),
              GUARD_TIMEOUT_MS,
              "operation guard fail timed out",
            );
          } catch (guardError) {
            console.error("[account-cancellation] unable to mark failed operation:", guardError?.message || guardError);
          }
        }
        throw error;
      }
    },
  };
}

module.exports = {
  CONFIRMATION,
  PublicAccountDeletionError,
  createAccountDeletionService,
  isDeletableStoragePath,
};
