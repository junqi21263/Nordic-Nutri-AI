import cloudbase from "@cloudbase/js-sdk";
import adapterForWxMp from "@cloudbase/adapter-wx_mp";

export const cloudbaseEnvironment = {
  envId: "lewis-healthy-d4glgqqzv73a5bc10",
  region: "ap-shanghai",
  // CloudBase publishable key. This is intentionally a client-side key and
  // supplies the base authorization context required by app.rdb() requests.
  publishableKey: "eyJhbGciOiJSUzI1NiIsImtpZCI6ImY3ODRhN2ExLTY2MmMtNDU4Zi05OTk0LWNkMjdkMjIxMTA1OSJ9.eyJpc3MiOiJodHRwczovL2xld2lzLWhlYWx0aHktZDRnbGdxcXp2NzNhNWJjMTAuYXAtc2hhbmdoYWkudGNiLWFwaS50ZW5jZW50Y2xvdWRhcGkuY29tIiwic3ViIjoiYW5vbiIsImF1ZCI6Imxld2lzLWhlYWx0aHktZDRnbGdxcXp2NzNhNWJjMTAiLCJleHAiOjQwODc5NDIxODIsImlhdCI6MTc4NDI1ODk4Miwibm9uY2UiOiJnQ25oY1JLVFFlV1gxOHdjdzBjX2ZBIiwiYXRfaGFzaCI6ImdDbmhjUktUUWVXWDE4d2N3MGNfZkEiLCJuYW1lIjoiQW5vbnltb3VzIiwic2NvcGUiOiJhbm9ueW1vdXMiLCJwcm9qZWN0X2lkIjoibGV3aXMtaGVhbHRoeS1kNGdsZ3FxenY3M2E1YmMxMCIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.hy0l-elyv8iUUtUEcSwIJSci3AUOp4Zyh0D0NCUmuP38aAA6ut-9X_TgPiwFKsl0EppEkeHx52H43N7WTyMLOjXiYk5Kow4y3yzMHs5L6AQuq4jr5yJ_Y8DfbYwN3B7CwBfuvvhSR6rkLV0WkzxmRqbNpDdKuRZ-8HWcs-UzgDAgeGkcir8exNgdlnY4tb53B1FyrtxOFE3s7dgWwn9SlZ4CHsbm1NH6aHD-oJDPKhULGv3dFAUakVw30iBZE3hU_AX_caxvilqM5N3zekcKbu5W68n7ppU0skxrivRsQkpFNJeP28MiU06I0yZ0IHSBtF0ac1kVAQmUNzrzCx1wRw",
  ticketEndpoint: "https://lewis-healthy-d4glgqqzv73a5bc10.service.tcloudbase.com/get-login-ticket",
} as const;

let initialized = false;
let cloudbaseApp: ReturnType<typeof cloudbase.init> | null = null;

export function getCloudbaseApp() {
  if (!initialized) {
    cloudbase.useAdapters(adapterForWxMp);
    cloudbaseApp = cloudbase.init({
      env: cloudbaseEnvironment.envId,
      region: cloudbaseEnvironment.region,
      accessKey: cloudbaseEnvironment.publishableKey,
      auth: { detectSessionInUrl: false },
    });
    initialized = true;
  }
  if (!cloudbaseApp) throw new Error("CloudBase client initialization failed");
  return cloudbaseApp;
}

export function getCloudbaseAuth() {
  return getCloudbaseApp().auth();
}

type CloudbaseRelationalClient = { from: (...args: never[]) => unknown };
type CloudbaseAppWithRuntimeComponents = {
  rdb?: unknown;
  mysql?: unknown;
};

export function resolveCloudbaseRelationalClient(
  app: CloudbaseAppWithRuntimeComponents,
): CloudbaseRelationalClient {
  const rdb = typeof app.rdb === "function" ? app.rdb() : app.rdb;
  const client = rdb ?? app.mysql;
  if (!client || typeof client !== "object" || typeof (client as { from?: unknown }).from !== "function") {
    throw new Error("CloudBase relational database client is unavailable");
  }
  return client as CloudbaseRelationalClient;
}

export function getCloudbaseDatabase() {
  return resolveCloudbaseRelationalClient(getCloudbaseApp() as unknown as CloudbaseAppWithRuntimeComponents);
}
