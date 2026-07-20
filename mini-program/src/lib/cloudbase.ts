import cloudbase from "@cloudbase/js-sdk";
import adapterForWxMp from "@cloudbase/adapter-wx_mp";

export const cloudbaseEnvironment = {
  envId: "lewis-healthy-d4glgqqzv73a5bc10",
  region: "ap-shanghai",
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
