import Taro from "@tarojs/taro";

export interface WechatHttpsLoginResult {
  user: { id: string };
  session: { accessToken: string };
  onboardingRequired: boolean;
}

const endpoint = "https://lewis-healthy-d4glgqqzv73a5bc10.service.tcloudbase.com/get-login-ticket";

export async function requestWechatHttpsLogin(code: string): Promise<WechatHttpsLoginResult> {
  const response = await Taro.request<unknown>({
    url: endpoint,
    method: "POST",
    header: { "content-type": "application/json" },
    data: { code },
  });
  const data = response.data as {
    user?: { id?: unknown };
    session?: { accessToken?: unknown };
    onboardingRequired?: unknown;
    code?: unknown;
  };

  if (response.statusCode !== 200 || typeof data.user?.id !== "string" || typeof data.session?.accessToken !== "string") {
    const error = new Error("微信登录服务请求失败");
    error.name = typeof data.code === "string" ? data.code : "WechatHttpsLoginRequestError";
    throw error;
  }

  return {
    user: { id: data.user.id },
    session: { accessToken: data.session.accessToken },
    onboardingRequired: Boolean(data.onboardingRequired),
  };
}
