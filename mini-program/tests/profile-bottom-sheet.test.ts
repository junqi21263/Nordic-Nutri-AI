import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");

describe("profile information bottom sheets", () => {
  it("dismisses the sheet from its backdrop without dismissing inner content clicks", () => {
    const source = readSource("../src/components/bottom-sheet/index.tsx");

    expect(source).toContain("onDismiss?: () => void");
    expect(source).toContain("event.target === event.currentTarget");
    expect(source).toContain("event.stopPropagation()");
  });

  it("uses taller bottom sheets; feedback keeps an explicit close control", () => {
    const source = readSource("../src/pages/profile/index.tsx");
    const styles = readSource("../src/styles/page.scss");

    expect(source).toContain('from "../../components/bottom-sheet"');
    expect(source).toContain("onDismiss={() => setActiveModal(null)}");
    expect(source).toContain('className="profile-sheet__close"');
    expect(source).toContain('ariaLabel="关闭反馈与帮助"');
    expect(source).not.toContain('ariaLabel="关闭隐私与数据"');
    expect(source).not.toContain('ariaLabel="关闭关于我们"');
    expect(styles).toContain(".profile-sheet {");
    expect(styles).toContain("min-height: 720px");
    expect(styles).toContain(".profile-sheet--info");
    expect(source.match(/lockScroll/g)?.length).toBeGreaterThanOrEqual(2);
    expect(styles).toContain(".profile-sheet--fixed");
    expect(styles).toContain("max-height: calc(100vh - 180px)");
    expect(readSource("../src/styles/components.scss")).toContain("position: fixed");
    expect(readSource("../src/styles/components.scss")).toContain("touch-action: pan-y");
    expect(styles).toContain("overflow-y: auto");
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

  it("closes the feedback sheet before showing the former inline copy in the success confirmation", () => {
    const profile = readSource("../src/pages/profile/index.tsx");
    const submitStart = profile.indexOf("const submitFeedback = async () => {");
    const submitEnd = profile.indexOf("} catch", submitStart);
    const successStart = profile.indexOf('title: "感谢你的反馈"');
    const successEnd = profile.indexOf("});", successStart);
    const successModal = profile.slice(successStart, successEnd);
    const submitFlow = profile.slice(submitStart, submitEnd);

    expect(submitStart).toBeGreaterThan(-1);
    expect(submitEnd).toBeGreaterThan(successStart);
    expect(successStart).toBeGreaterThan(-1);
    expect(submitFlow).toContain("setActiveModal(null);");
    expect(submitFlow).toContain("setTimeout");
    expect(submitFlow).toContain("bottomSheetExitDuration");
    expect(successModal).toContain("dismissible: false");
    expect(successModal).not.toContain("onPrimary: () => setActiveModal(null)");
    expect(successModal).toContain('description: "我们已收到，会用它持续改进体验。"');
    expect(profile).not.toContain("profile-feedback-submitted");
  });

  it("hides the tab bar via the store visible flag until the sheet exit animation finishes", () => {
    const tabStore = readSource("../src/stores/tab-bar-store.ts");
    const pageLayout = readSource("../src/layouts/page-layout/index.tsx");
    const profile = readSource("../src/pages/profile/index.tsx");

    expect(tabStore).toContain("visible: boolean");
    expect(tabStore).toContain("setVisible: (visible: boolean) => void");
    expect(pageLayout).toContain("tabbarVisible");
    expect(pageLayout).toContain("BottomTabBar");
    expect(profile).toContain("setTabBarVisible(false)");
    expect(profile).toContain("bottomSheetExitDuration");
  });

  it("uses a native multiline feedback field with keyboard-safe Mini Program props", () => {
    const profile = readSource("../src/pages/profile/index.tsx");
    const sheet = readSource("../src/components/bottom-sheet/index.tsx");
    const componentStyles = readSource("../src/styles/components.scss");
    const styles = readSource("../src/styles/page.scss");

    expect(profile).toContain("Textarea");
    expect(profile).toContain("adjustPosition");
    expect(profile).toContain("cursorSpacing={20}");
    expect(profile).toContain("disableDefaultPadding");
    expect(profile).toContain("showConfirmBar={false}");
    expect(profile).toContain("maxlength={2000}");
    expect(profile).not.toContain("maxlength={120}");
    expect(profile).not.toContain("autoHeight");
    expect(profile).not.toContain('<Input\n            className="profile-modal__input"');
    expect(styles).toContain("min-height: 416px");
    expect(styles).toContain("font-size: $font-body");
    expect(styles).toContain("white-space: pre-wrap");
    expect(styles).toContain("overflow-y: auto");
    expect(styles).toContain(".profile-sheet--info .profile-modal__lead");
    expect(styles).toContain("white-space: nowrap");
    expect(profile).toContain('nativeInput');
    expect(sheet).toContain("nativeInput?: boolean");
    expect(sheet).toContain('bottom-sheet--native-input');
    expect(componentStyles).toContain("sheet-native-input-enter");
    expect(componentStyles).toContain("sheet-native-input-exit");
    expect(sheet).toContain("lockScroll?: boolean");
    expect(componentStyles).toContain("bottom-sheet-backdrop--locked");
    expect(componentStyles).toContain("bottom-sheet--locked");
  });

  it("locks the shared page scroll container while profile sheets are open", () => {
    const profile = readSource("../src/pages/profile/index.tsx");
    const layout = readSource("../src/layouts/page-layout/index.tsx");
    const styles = readSource("../src/styles/layout.scss");

    expect(profile).toContain("const isPageScrollLocked = activeModal !== null");
    expect(profile).toContain("scrollLocked={isPageScrollLocked}");
    expect(layout).toContain("scrollLocked?: boolean");
    expect(layout).toContain('"page-layout--scroll-locked"');
    expect(styles).toContain(".page-layout--scroll-locked .page-layout__scroll");
    expect(styles).toContain("overflow: hidden");
  });

  it("opens feedback history when the user has prior submissions", () => {
    const profile = readSource("../src/pages/profile/index.tsx");
    const openFeedbackStart = profile.indexOf("const openFeedback = () => {");
    const openFeedbackEnd = profile.indexOf("};", openFeedbackStart);
    const openFeedback = profile.slice(openFeedbackStart, openFeedbackEnd);

    expect(openFeedback).toContain('setFeedbackMode(feedbackItems.length ? "history" : "submit")');
    expect(openFeedback).not.toContain("setFeedbackSubmitted");
  });
});
