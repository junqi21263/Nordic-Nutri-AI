/** Keep in sync with mini-program/src/features/profile/nickname-moderation.ts */
const BANNED_NICKNAME_TERMS = [
  "官方",
  "客服",
  "管理员",
  "admin",
  "administrator",
  "nordicnutri",
  "nordic nutri",
  "微信团队",
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
];

const NICKNAME_MODERATION_MESSAGE = "昵称包含不当内容，请更换";

function normalizeNicknameForModeration(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-.·•‧・\u200b-\u200d\ufeff]/g, "");
}

function findBannedNicknameTerm(nickname) {
  const normalized = normalizeNicknameForModeration(nickname);
  if (!normalized) return null;
  for (const term of BANNED_NICKNAME_TERMS) {
    const needle = normalizeNicknameForModeration(term);
    if (needle && normalized.includes(needle)) return term;
  }
  return null;
}

function assertNicknameAllowed(nickname) {
  if (findBannedNicknameTerm(nickname)) {
    const error = new Error(NICKNAME_MODERATION_MESSAGE);
    error.code = "PRODUCT_DATA_INVALID";
    throw error;
  }
}

module.exports = {
  BANNED_NICKNAME_TERMS,
  NICKNAME_MODERATION_MESSAGE,
  normalizeNicknameForModeration,
  findBannedNicknameTerm,
  assertNicknameAllowed,
};
