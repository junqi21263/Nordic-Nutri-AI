import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("profile logout action", () => {
  it("offers an explicit logout action that clears the session and returns to the login entry", () => {
    const page = readFileSync(
      resolve(import.meta.dirname, "../src/pages/profile/index.tsx"),
      "utf8",
    );

    expect(page).toContain("createLogoutFlow");
    expect(page).toContain("signOut");
    expect(page).toContain('url: "/pages/auth-entry/index"');
    expect(page).toContain("退出登录");
  });
});
