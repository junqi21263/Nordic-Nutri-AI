import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(import.meta.dirname, "../src");
const read = (path: string) => readFileSync(resolve(srcRoot, path), "utf8");

describe("privacy policy and disclaimer", () => {
  it("routes the only privacy card to the combined policy page", () => {
    expect(read("app.config.ts")).toContain('"pages/privacy-policy/index"');
    const profile = read("pages/profile/index.tsx");
    expect(profile).toContain('title="隐私政策与免责声明"');
    expect(profile).toContain('openPage("/pages/privacy-policy/index")');
    expect(profile).not.toContain('title="隐私与数据"');
  });

  it("discloses collection, purpose, retention, rights, deletion and medical boundary", () => {
    const policy = read("pages/privacy-policy/index.tsx");
    for (const copy of [
      "收集的信息",
      "使用目的",
      "存储与保留",
      "AI 处理",
      "你的权利",
      "注销 Nordic Nutri AI 产品账号",
      "不影响你的微信账号",
      "不构成医疗诊断、治疗或处方",
      "反馈与帮助",
    ]) {
      expect(policy).toContain(copy);
    }
  });

  it("keeps a visible non-medical disclaimer in home, analysis and coach", () => {
    for (const page of ["home/index.tsx", "analysis-result/index.tsx", "coach/index.tsx"]) {
      expect(read(`pages/${page}`)).toContain("不构成医疗诊断或治疗建议");
    }
  });
});
