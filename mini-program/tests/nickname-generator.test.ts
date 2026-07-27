import { describe, expect, it } from "vitest";
import { generateNickname } from "../src/features/profile/nickname-generator";

const HANZI = /^[\u4e00-\u9fff]{5,6}$/;

describe("nickname generator", () => {
  it("produces a 5–6 hanzi Chinese nickname", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateNickname()).toMatch(HANZI);
    }
  });

  it("avoids repeating the excluded nickname", () => {
    for (let i = 0; i < 50; i += 1) {
      const current = generateNickname();
      const next = generateNickname(current);
      expect(next).toMatch(HANZI);
      expect(next).not.toBe(current);
    }
  });

  it("never emits system words or numbers", () => {
    for (let i = 0; i < 50; i += 1) {
      const nickname = generateNickname();
      expect(nickname).not.toMatch(/[0-9]/);
      expect(nickname).not.toContain("用户");
      expect(nickname).not.toContain("游客");
      expect(nickname).not.toContain("匿名");
      expect(nickname).not.toContain("会员");
    }
  });
});
