import { createClient } from "npm:@supabase/supabase-js@2";
import { getServerEnv } from "../_shared/auth.ts";
import { AppError, validationError } from "../_shared/errors.ts";
import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { success } from "../_shared/response.ts";
import { assertString, parseJsonBody } from "../_shared/validation.ts";

type WechatIdentity = { openid: string; unionid?: string };

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function isMockEnabled() {
  const env = Deno.env.get("APP_ENV") ?? "local";
  return (env === "local" || env === "test") && Deno.env.get("WECHAT_MOCK_ENABLED") === "true";
}

async function exchangeCode(code: string): Promise<WechatIdentity> {
  if (isMockEnabled()) {
    const codes = JSON.parse(getServerEnv("WECHAT_MOCK_CODES")) as Record<string, WechatIdentity>;
    const identity = codes[code];
    if (!identity) throw new AppError("UNAUTHORIZED", "WeChat code is invalid", 401);
    return identity;
  }
  const appId = getServerEnv("WECHAT_APP_ID");
  const secret = getServerEnv("WECHAT_APP_SECRET");
  const signal = AbortSignal.timeout(5000);
  let response: Response;
  try {
    response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`, { signal });
  } catch {
    throw new AppError("AI_SERVICE_ERROR", "WeChat authentication service is unavailable", 503, true);
  }
  if (!response.ok) throw new AppError("AI_SERVICE_ERROR", "WeChat authentication service is unavailable", 503, true);
  const result = await response.json() as { openid?: string; unionid?: string; errcode?: number };
  if (result.errcode || !result.openid) throw new AppError("UNAUTHORIZED", "WeChat code is invalid or expired", 401);
  return { openid: result.openid, unionid: result.unionid };
}

Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  const body = await parseJsonBody(request);
  const code = assertString(body, "code", { minLength: 8, maxLength: 2048 });
  const identity = await exchangeCode(code);
  const openidHash = await sha256(identity.openid);
  const codeHash = await sha256(code);
  const admin = createClient(getServerEnv("SUPABASE_URL"), getServerEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: used } = await admin.from("wechat_login_codes").select("code_hash").eq("code_hash", codeHash).maybeSingle();
  if (used) throw new AppError("CONFLICT", "WeChat code has already been used", 409);

  const { data: existing } = await admin.from("wechat_identities").select("user_id").eq("openid_hash", openidHash).maybeSingle();
  const email = `wx_${openidHash}@wechat.nordic-nutri.invalid`;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link?.user?.id || !link.properties?.hashed_token) {
    throw new AppError("DATABASE_ERROR", "Unable to create authentication session", 500, true);
  }
  const userId = existing?.user_id ?? link.user.id;
  if (!existing) {
    const { error } = await admin.from("wechat_identities").insert({ user_id: userId, openid_hash: openidHash });
    if (error) throw new AppError("CONFLICT", "WeChat identity mapping conflict", 409);
  }
  const { error: codeError } = await admin.from("wechat_login_codes").insert({ code_hash: codeHash, user_id: userId });
  if (codeError) throw new AppError("CONFLICT", "WeChat code has already been used", 409);
  await admin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", userId);
  return success({ tokenHash: link.properties.hashed_token, type: "magiclink", userId }, context.requestId);
}));
