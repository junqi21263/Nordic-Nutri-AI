import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../src");

describe("Android auth provider icons", () => {
  it("uses local NordicIcon assets for Google, email, and phone entry points", () => {
    const page = readFileSync(resolve(root, "pages/android-auth/index.tsx"), "utf8");
    const components = readFileSync(resolve(root, "pages/android-auth/auth-components.tsx"), "utf8");
    const iconRegistry = readFileSync(resolve(root, "components/nordic-icon/index.tsx"), "utf8");
    const styles = readFileSync(resolve(root, "pages/android-auth/index.scss"), "utf8");

    for (const name of ["google", "mail", "phone"]) {
      expect(page).toContain(`<NordicIcon name="${name}" size={32}`);
      expect(iconRegistry).toContain(`| "${name}"`);
      expect(iconRegistry).toContain(`  ${name},`);
      expect(readFileSync(resolve(root, `assets/icons/${name}.svg`), "utf8")).toContain("<svg");
    }
    expect(components).toContain('<NordicIcon name="china" size={18}');
    expect(iconRegistry).toContain('| "china"');
    expect(iconRegistry).toContain("  china,");
    expect(readFileSync(resolve(root, "assets/icons/china.svg"), "utf8")).toContain("<svg");

    expect(page).not.toContain("auth-google-mark");
    expect(page).not.toContain("auth-provider-icon--email");
    expect(page).not.toContain("auth-provider-icon--phone");
    expect(page).toContain('className="auth-provider-content"');
    expect(page).toContain('className="auth-provider-label"');
    expect(styles).toContain(".auth-provider-content { display: flex; align-items: center; justify-content: center;");
    expect(styles).toContain(".auth-provider-content > .nordic-icon { flex: 0 0 auto; }");
    expect(styles).toContain(".auth-provider-content > .auth-provider-label { white-space: nowrap; }");
    expect(styles).not.toContain(".auth-landing__content > .app-button > .auth-button-content, .auth-landing__providers .app-button > .auth-button-content { position: absolute;");
    expect(styles).toContain(".auth-button-content { display: flex; align-items: center; justify-content: center;");
  });
});
