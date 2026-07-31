/** Shared copy for achievement detail sheets (aligned with server definitions). */
export const ACHIEVEMENT_REQUIREMENTS: Record<string, string> = {
  第一餐记录: "成功记录任意 1 餐到云端。",
  早餐节奏: "在 3 个不同日期记录早餐。",
  午餐专注: "在 3 个不同日期记录午餐。",
  晚餐平衡: "在 3 个不同日期记录晚餐。",
  加餐有度: "在 3 个不同日期记录加餐。",
  蛋白达人: "有 3 天蛋白质完成度达到 90% 及以上。",
  连续七天: "连续 7 天都有饮食记录。",
  连续十四天: "连续 14 天都有饮食记录。",
  累计三十餐: "累计记录 30 餐。",
  累计五十餐: "累计记录 50 餐。",
  累计一百餐: "累计记录 100 餐。",
  水分自律: "即将上线：完成每日饮水目标。",
  睡眠优先: "即将上线：连续记录优质睡眠。",
  训练伙伴: "即将上线：完成一次训练打卡。",
  恢复达人: "即将上线：完成恢复日节奏。",
  蔬菜优先: "有 3 天的餐食包含蔬菜。",
  碳水平衡: "有 3 天碳水完成度在 60%–120%，且蛋白质不少于 60%。",
  低脂选择: "有 3 天脂肪未超标，且蛋白质完成度不少于 60%。",
  收藏灵感: "收藏任意 1 餐作为灵感。",
  连续达标: "连续 3 天营养完成度达到 80% 及以上。",
};

export function getAchievementRequirement(title: string) {
  return ACHIEVEMENT_REQUIREMENTS[title] || "继续保持记录，即可逐步解锁。";
}

export function formatAchievementUnlockedAt(value?: string | null) {
  if (!value) return "已根据云端记录解锁";
  const raw = String(value);
  // Server date-level unlocks use noon China time — show calendar day only.
  if (raw.includes("T12:00:00+08")) {
    return `${raw.slice(0, 10)} 达成`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const day = raw.slice(0, 10);
    return day.length === 10 ? `${day} 达成` : "已根据云端记录解锁";
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (/T\d{2}:\d{2}/.test(raw)) {
    return `${y}-${m}-${d} ${hh}:${mm} 达成`;
  }
  return `${y}-${m}-${d} 达成`;
}
