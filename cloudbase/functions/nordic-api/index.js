const { createHmac } = require("node:crypto");

const defaultCloudbaseEnvironmentId = "lewis-healthy-d4glgqqzv73a5bc10";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hashOpenId(openid, pepper) {
  if (typeof openid !== "string" || !openid) throw fail("UNAUTHORIZED", "未识别到小程序用户身份");
  if (typeof pepper !== "string" || !pepper) throw fail("SERVER_CONFIGURATION", "服务端身份配置缺失");
  return createHmac("sha256", pepper).update(`openid:${openid}`).digest("hex");
}

function readAction(event) {
  if (!event || typeof event !== "object" || typeof event.action !== "string") {
    throw fail("INVALID_ACTION", "请求动作无效");
  }
  return event.action;
}

function createApiService({ getOpenId, bootstrapUser }) {
  return {
    async handle(event, context) {
      const action = readAction(event);
      if (action !== "bootstrap") throw fail("INVALID_ACTION", "不支持的请求动作");
      const openid = await getOpenId(context);
      if (typeof openid !== "string" || !openid) throw fail("UNAUTHORIZED", "未识别到小程序用户身份");
      // Do not accept a caller-supplied userId. The repository receives only
      // the identity derived from CloudBase's verified Mini Program context.
      return bootstrapUser(openid);
    },
  };
}

function getRuntimeEnvironmentId(environment) {
  return environment.CLOUDBASE_ENV_ID || environment.TCB_ENV || defaultCloudbaseEnvironmentId;
}

function getRdbClient() {
  const cloudbase = require("@cloudbase/js-sdk");
  const envId = getRuntimeEnvironmentId(process.env);
  const accessKey = process.env.CLOUDBASE_APIKEY;
  if (!envId || !accessKey) throw fail("SERVER_CONFIGURATION", "数据库服务端配置缺失");
  const app = cloudbase.init({ env: envId, accessKey, auth: { detectSessionInUrl: false } });
  const rdb = typeof app.rdb === "function" ? app.rdb() : app.rdb;
  if (!rdb || typeof rdb.from !== "function") throw fail("SERVER_CONFIGURATION", "数据库客户端不可用");
  return rdb;
}

function createProductUserRepository(db, identityPepper) {
  return async (openid) => {
    const openidHash = hashOpenId(openid, identityPepper);
    const existing = await db.from("app_users").select("id").eq("openid_hash", openidHash).maybeSingle();
    if (existing.error) throw fail("DATABASE_UNAVAILABLE", "用户资料读取失败");

    let userId = existing.data?.id;
    if (!userId) {
      const created = await db.from("app_users")
        .insert({ openid_hash: openidHash })
        .select("id")
        .single();
      if (created.error || !created.data?.id) throw fail("DATABASE_UNAVAILABLE", "用户资料创建失败");
      userId = created.data.id;
    }

    const profile = await db.from("profiles")
      .select("onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle();
    if (profile.error) throw fail("DATABASE_UNAVAILABLE", "用户资料读取失败");

    return {
      userId,
      onboardingRequired: !profile.data?.onboarding_completed_at,
    };
  };
}

function createNativeOpenIdResolver(cloud) {
  return () => cloud.getWXContext().OPENID;
}

function createRuntimeService() {
  const cloud = require("wx-server-sdk");
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const identityPepper = process.env.OPENID_HASH_PEPPER;
  const db = getRdbClient();
  return createApiService({
    getOpenId: createNativeOpenIdResolver(cloud),
    bootstrapUser: createProductUserRepository(db, identityPepper),
  });
}

async function main(event, context) {
  try {
    return { ok: true, data: await createRuntimeService().handle(event, context) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: typeof error?.code === "string" ? error.code : "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "服务暂时不可用",
      },
    };
  }
}

module.exports = { main, createApiService, createProductUserRepository, createNativeOpenIdResolver, getRuntimeEnvironmentId, hashOpenId };
