export type WechatProfile = {
  nickname: string;
  avatarUrl: string | null;
};

type WechatProfilePayload = {
  userInfo?: {
    nickName?: unknown;
    avatarUrl?: unknown;
  };
};

export function readWechatProfile(payload: WechatProfilePayload): WechatProfile | null {
  const nickname =
    typeof payload.userInfo?.nickName === "string" ? payload.userInfo.nickName.trim() : "";
  if (!nickname) return null;
  return {
    nickname,
    avatarUrl:
      typeof payload.userInfo?.avatarUrl === "string" && payload.userInfo.avatarUrl.trim()
        ? payload.userInfo.avatarUrl.trim()
        : null,
  };
}
