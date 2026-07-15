import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");

describe("profile information bottom sheets", () => {
  it("dismisses the sheet from its backdrop without dismissing inner content clicks", () => {
    const source = readSource("../src/components/bottom-sheet/index.tsx");

    expect(source).toContain("onDismiss?: () => void");
    expect(source).toContain('onClick={onDismiss}');
    expect(source).toContain("event.stopPropagation()");
  });

  it("uses taller bottom sheets with an explicit close control for every profile information entry", () => {
    const source = readSource("../src/pages/profile/index.tsx");
    const styles = readSource("../src/styles/page.scss");

    expect(source).toContain('from "../../components/bottom-sheet"');
    expect(source).toContain('onDismiss={() => setActiveModal(null)}');
    expect(source).toContain('className="profile-sheet__close"');
    expect(source).toContain('name="x"');
    expect(styles).toContain(".profile-sheet {");
    expect(styles).toContain("min-height: 720px");
  });

  it("keeps the sheet mounted for a downward exit animation and lowers compact actions", () => {
    const sheet = readSource("../src/components/bottom-sheet/index.tsx");
    const profile = readSource("../src/pages/profile/index.tsx");
    const componentStyles = readSource("../src/styles/components.scss");
    const pageStyles = readSource("../src/styles/page.scss");

    expect(sheet).toContain("const [isClosing, setIsClosing]");
    expect(sheet).toContain("setTimeout");
    expect(sheet).toContain("bottom-sheet--closing");
    expect(componentStyles).toContain("@keyframes sheet-exit");
    expect(componentStyles).toContain(".bottom-sheet--closing");
    expect(profile).toContain('size="medium"');
    expect(pageStyles).toContain(".profile-sheet__action");
  });

  it("hides the independent custom tab bar until the sheet exit animation finishes", () => {
    const tabStore = readSource("../src/stores/tab-bar-store.ts");
    const customTabBar = readSource("../src/custom-tab-bar/index.tsx");
    const profile = readSource("../src/pages/profile/index.tsx");

    expect(tabStore).toContain("visible: boolean");
    expect(tabStore).toContain("setVisible: (visible: boolean) => void");
    expect(customTabBar).toContain("return visible ? <BottomTabBar");
    expect(profile).toContain("setTabBarVisible(false)");
    expect(profile).toContain("bottomSheetExitDuration");
  });

  it("uses a multiline feedback field that wraps and grows while preserving the local draft", () => {
    const profile = readSource("../src/pages/profile/index.tsx");
    const styles = readSource("../src/styles/page.scss");

    expect(profile).toContain("Textarea");
    expect(profile).toContain("autoHeight");
    expect(profile).not.toContain("<Input\n            className=\"profile-modal__input\"");
    expect(styles).toContain("min-height: 416px");
    expect(styles).toContain("font-size: $font-body");
    expect(styles).toContain("white-space: pre-wrap");
  });
});
