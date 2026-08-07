import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("persisted coach boundary", () => {
  it("uses authenticated coach history, answer, brief, daily tip, and restart endpoints", () => {
    const api = read("src/api/coach-api.ts");

    expect(api).toContain("getProductCoachMessages");
    expect(api).toContain("sendProductCoachMessage");
    expect(api).toContain("getProductCoachBrief");
    expect(api).toContain("ProductCoachReply");
    expect(api).toContain("ProductCoachBrief");
    expect(api).toContain("ProductCoachDailyUsage");
    expect(api).toContain("dailyUsage: ProductCoachDailyUsage");
    expect(api).toContain("serverTime: string");
    expect(api).toContain("heroPrompt: string");
    expect(api).toContain("ProductCoachDailyTip");
    expect(api).toContain("getProductCoachDailyTip");
    expect(api).toContain("restartProductCoachConversation");
    expect(api).toContain("streamProductCoachMessage");
    expect(api).toContain("ProductCoachStreamEvent");
    expect(api).toContain("/coach/messages");
    expect(api).toContain("/coach-answer");
    expect(api).toContain("/coach-answer/stream");
    expect(api).toContain("/coach/brief");
    expect(api).toContain("/coach/daily-tip");
    expect(api).toContain("/coach/restart");
  });

  it("keeps the coach page wired to persisted history and the new actions", () => {
    const page = read("src/pages/coach/index.tsx");

    expect(page).toContain("getProductCoachMessages");
    expect(page).toContain("sendProductCoachMessage");
    expect(page).toContain("streamProductCoachMessage");
    expect(page).toContain("COACH_DAILY_LIMIT_REACHED");
    expect(page).toContain("当前每人每日限制聊20句");
    expect(page).toContain("getProductCoachBrief");
    expect(page).toContain("refreshCoachBrief");
    expect(page).toContain("useDidShow");
    expect(page).toContain("getProductCoachDailyTip");
    expect(page).toContain("restartProductCoachConversation");
    expect(page).toContain("NOVA 小贴士");
    expect(page).toContain("新对话");
    expect(page).not.toContain("重启对话");
    expect(page).toContain("heroPrompt");
    expect(page).toContain("getCoachGreeting");
    expect(page).toContain("analyzeProductImage");
    expect(page).toContain("Taro.chooseMedia");
    expect(page).toContain('event.type === "delta"');
    expect(page).toContain('event.type === "complete"');
    expect(page).not.toContain("replyFor");
  });
});
