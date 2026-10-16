import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expectLocalizedCopy } from "./i18n-source-assertions";

describe("profile logout action", () => {
  it("offers an explicit logout action that clears the session and returns to the login entry", () => {
    const page = readFileSync(
      resolve(import.meta.dirname, "../src/pages/profile/index.tsx"),
      "utf8",
    );

    expect(page).toContain("createLogoutFlow");
    expect(page).toContain("signOut");
    expect(page).toContain(
      'const loginEntryPath = isAndroidApp ? "/pages/android-auth/index" : "/pages/auth-entry/index";',
    );
    expect(page).toContain("url: loginEntryPath");
    expectLocalizedCopy(page, "退出登录？");
    expectLocalizedCopy(page, "仅退出当前设备，\n不会删除你的饮食记录。");
    expectLocalizedCopy(page, "退出登录");
    expectLocalizedCopy(page, "取消");
  });
});
