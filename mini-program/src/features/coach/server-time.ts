/** Asia/Shanghai is fixed UTC+8 (no DST). Avoid `Intl` — missing on many WeChat runtimes. */
function getShanghaiHour(date: Date): number {
  const shanghai = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shanghai.getUTCHours();
}

export function getCoachGreeting(serverTime: string | null): string {
  if (!serverTime) return "你好";
  const date = new Date(serverTime);
  if (Number.isNaN(date.getTime())) return "你好";
  const hour = getShanghaiHour(date);
  if (hour >= 5 && hour < 11) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  if (hour < 23) return "晚上好";
  return "夜深了";
}
