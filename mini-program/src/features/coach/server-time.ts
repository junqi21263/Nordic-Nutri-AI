const chinaHourFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Shanghai",
});

export function getCoachGreeting(serverTime: string | null): string {
  if (!serverTime) return "你好";
  const date = new Date(serverTime);
  if (Number.isNaN(date.getTime())) return "你好";
  const hour = Number(chinaHourFormatter.format(date));
  if (hour >= 5 && hour < 11) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  if (hour < 23) return "晚上好";
  return "夜深了";
}
