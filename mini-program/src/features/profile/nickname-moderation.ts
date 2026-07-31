/** Compact denylist for nickname moderation (client + mirrored on server). */
const BANNED_NICKNAME_TERMS = [
  // Impersonation / platform
  "官方",
  "客服",
  "管理员",
  "admin",
  "administrator",
  "nordicnutri",
  "nordic nutri",
  "微信团队",
  // Common profanity / abuse
  "傻逼",
  "傻b",
  "煞笔",
  "操你",
  "操逼",
  "草泥马",
  "妈的",
  "妈逼",
  "他妈",
  "你妈",
  "尼玛",
  "去死",
  "白痴",
  "智障",
  "脑残",
  "垃圾",
  "滚蛋",
  "混蛋",
  "王八蛋",
  "贱人",
  "婊子",
  "屌",
  "鸡巴",
  "阴茎",
  "阴道",
  "性交",
  "做爱",
  "色情",
  "黄色",
  "裸体",
  "porn",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "nigger",
  "nigga",
  // Scam / spam cues
  "加微信",
  "加qq",
  "代购",
  "刷单",
  "赌博",
  "博彩",
  "彩票内幕",
  "毒品",
  "冰毒",
  "海洛因",
] as const;

const NICKNAME_MODERATION_MESSAGE = "昵称包含不当内容，请更换";

export function normalizeNicknameForModeration(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-.·•‧・\u200b-\u200d\ufeff]/g, "");
}

export function findBannedNicknameTerm(nickname: string): string | null {
  const normalized = normalizeNicknameForModeration(nickname);
  if (!normalized) return null;
  for (const term of BANNED_NICKNAME_TERMS) {
    const needle = normalizeNicknameForModeration(term);
    if (needle && normalized.includes(needle)) return term;
  }
  return null;
}

export function nicknameModerationError(nickname: string): string | undefined {
  return findBannedNicknameTerm(nickname) ? NICKNAME_MODERATION_MESSAGE : undefined;
}

export function assertNicknameAllowed(nickname: string): void {
  const error = nicknameModerationError(nickname);
  if (error) throw new Error(error);
}

export { NICKNAME_MODERATION_MESSAGE };
