import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expectLocalizedCopy } from "./i18n-source-assertions";
import zhCN from "../src/i18n/locales/zh-CN.json";

const srcRoot = resolve(import.meta.dirname, "../src");
const read = (path: string) => readFileSync(resolve(srcRoot, path), "utf8");

describe("privacy policy and disclaimer", () => {
  it("routes the only privacy card to the combined policy page", () => {
    expect(read("app.config.ts")).toContain('"pages/privacy-policy/index"');
    const profile = read("pages/profile/index.tsx");
    expectLocalizedCopy(profile, "隐私政策与免责声明");
    expect(profile).toContain('openLegalPage("/pages/privacy-policy/index")');
    expect(profile).not.toContain('title="隐私与数据"');
  });

  it("discloses collection, purpose, retention, rights, deletion and medical boundary", () => {
    const policy = read("pages/privacy-policy/index.tsx");
    expect(policy).toContain('t("privacyPolicy.sections", { returnObjects: true })');
    expect(policy).toContain("{section.title}");
    expect(policy).toContain("{section.content}");
    for (const copy of [
      "我们处理哪些信息",
      "为什么使用这些信息",
      "信息保存与删除",
      "你的选择与权利",
      "账号注销或记录删除",
      "模型生成的食物名称和营养数据只是估算",
    ]) {
      expect(zhCN.privacyPolicy.sections.some((section) => `${section.title} ${section.content}`.includes(copy))).toBe(true);
    }
    expectLocalizedCopy(policy, "注销 Nordic Nutri 账号");
  });

  it("discloses the approved policy metadata", () => {
    const policy = read("pages/privacy-policy/index.tsx");
    for (const copy of [
      "运营者: LewisLee",
      "正式版",
      "生效日期: 2026-10-14",
    ]) {
      expectLocalizedCopy(policy, copy);
    }
  });

  it("places policy metadata after the disclaimer section", () => {
    const policy = read("pages/privacy-policy/index.tsx");
    expect(policy.indexOf("{sections.map((section, index) => (")).toBeLessThan(
      policy.indexOf('t("privacyPolicy.metadata")'),
    );
  });

  it("keeps both legal pages within the safe area while lifting their content slightly", () => {
    const styles = read("styles/page.scss");
    const terms = read("pages/terms-of-service/index.tsx");
    expect(styles).toContain("padding-top: calc(env(safe-area-inset-top) + #{$space-8});");
    expect(terms).toContain('className="page-layout--privacy-policy"');
  });

  it("keeps the account-cancellation card copy in a responsive, non-overlapping layout", () => {
    const policy = read("pages/privacy-policy/index.tsx");
    const styles = read("styles/page.scss");

    expect(policy).toContain('className="privacy-policy-page__cancellation-copy"');
    expect(policy).toContain('className="privacy-policy-page__cancellation-title"');
    expect(policy).toContain('className="privacy-policy-page__cancellation-description"');
    expect(styles).toContain("min-width: 0");
    expect(styles).toContain("white-space: nowrap");
    expect(styles).toContain("@media (max-width: 359px)");
  });

  it("keeps a visible non-medical disclaimer in home, analysis and coach", () => {
    for (const page of ["home/index.tsx", "analysis-result/index.tsx", "coach/index.tsx"]) {
      expectLocalizedCopy(read(`pages/${page}`), "不构成医疗诊断或治疗建议");
    }
  });
});
