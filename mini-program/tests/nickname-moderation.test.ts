import { describe, expect, it } from "vitest";
import {
  findBannedNicknameTerm,
  nicknameModerationError,
  normalizeNicknameForModeration,
} from "../src/features/profile/nickname-moderation";
import { createInitialOnboardingDraft, validateBodyProfile } from "../src/features/onboarding/domain";

describe("nickname moderation", () => {
  it("normalizes spaces and case before matching", () => {
    expect(normalizeNicknameForModeration("Nordic Nutri")).toBe("nordicnutri");
    expect(findBannedNicknameTerm("我是官方客服")).toBe("官方");
    expect(findBannedNicknameTerm("Fu ck")).toBe("fuck");
  });

  it("allows ordinary nicknames", () => {
    expect(nicknameModerationError("林间慢慢走")).toBeUndefined();
    expect(nicknameModerationError("Nova")).toBeUndefined();
  });

  it("blocks banned nicknames in body-profile validation", () => {
    const draft = {
      ...createInitialOnboardingDraft(),
      nickname: "傻逼用户",
      goalType: "maintenance" as const,
      age: "28",
      gender: "female" as const,
      heightCm: "165",
      weightKg: "58",
      activityLevel: "moderate" as const,
      trainingDays: "4",
    };
    const result = validateBodyProfile(draft, "2026-07-13");
    expect(result.valid).toBe(false);
    expect(result.errors.nickname).toBe("昵称包含不当内容，请更换");
  });
});
