export type GoogleCredentialBridge = {
  getIdToken: () => Promise<string>;
};

export async function getGoogleIdToken(bridge?: GoogleCredentialBridge) {
  const native =
    bridge ??
    (globalThis as { NordicGoogleCredentialManager?: GoogleCredentialBridge })
      .NordicGoogleCredentialManager;
  if (!native || typeof native.getIdToken !== "function") {
    throw new Error("Google 登录暂未配置");
  }
  const token = await native.getIdToken();
  if (typeof token !== "string" || !token) throw new Error("Google 登录未返回凭证");
  return token;
}
