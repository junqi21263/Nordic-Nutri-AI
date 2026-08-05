import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("coach composer shape", () => {
  it("keeps the input as a rounded rectangle in the component stylesheet", () => {
    const componentStyles = read("src/pages/coach/components/CoachComposer/index.scss");

    expect(componentStyles).toContain(".coach-composer__input");
    expect(componentStyles).toContain("border-radius: 12px");
    expect(componentStyles).not.toContain("border-radius: $radius-full");
  });

  it("does not keep the legacy full-pill composer definition in page styles", () => {
    const pageStyles = read("src/styles/page.scss");
    const legacyComposer = pageStyles.match(/\.coach-composer\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(legacyComposer).not.toContain("$radius-full");
    expect(legacyComposer).not.toContain("min-height: 88px");
  });

  it("keeps the fixed composer opaque so scrolling content cannot show through it", () => {
    const componentStyles = read("src/pages/coach/components/CoachComposer/index.scss");

    expect(componentStyles).toContain("background: $color-warm-white;");
    expect(componentStyles).not.toContain("background: rgba(250, 250, 247, 0.82);");
  });

  it("keeps the fixed composer flush with the tab bar when the keyboard is closed", () => {
    const component = read("src/pages/coach/components/CoachComposer/index.tsx");

    expect(component).toContain(": `calc(${layout.tabBarHeight}px + ${layout.safeBottom}px)`;");
    expect(component).not.toContain("+ ${layout.safeBottom}px + 8px");
  });

  it("uses an auto-height textarea so long input wraps instead of scrolling horizontally", () => {
    const component = read("src/pages/coach/components/CoachComposer/index.tsx");
    const componentStyles = read("src/pages/coach/components/CoachComposer/index.scss");

    expect(component).toContain("Textarea");
    expect(component).toContain("autoHeight");
    expect(component).not.toContain("<Input");
    expect(componentStyles).toContain("white-space: pre-wrap");
    expect(componentStyles).toContain("word-break: break-word");
  });

  it("keeps the native empty-state hint left-aligned without a custom overlay", () => {
    const component = read("src/pages/coach/components/CoachComposer/index.tsx");
    const componentStyles = read("src/pages/coach/components/CoachComposer/index.scss");

    expect(component).toContain("placeholder={placeholder}");
    expect(component).toContain('placeholderClass="coach-composer__input-placeholder"');
    expect(component).not.toContain("placeholderStyle");
    expect(componentStyles).toContain(".coach-composer__input-placeholder");
    expect(componentStyles).toContain("font-size: $font-body;");
    expect(component).not.toContain("coach-composer__placeholder");
  });

  it("uses the native textarea placeholder so IME composition cannot overlap a custom text layer", () => {
    const component = read("src/pages/coach/components/CoachComposer/index.tsx");
    const page = read("src/pages/coach/index.tsx");

    expect(component).toContain("placeholder={placeholder}");
    expect(component).not.toContain("coach-composer__placeholder");
    expect(component).not.toContain("onFocusChange");
    expect(page).not.toContain("coach-chat__composer-scrim");
  });

  it("keeps the coach safety disclaimer on one truncated line", () => {
    const pageStyles = read("src/styles/page.scss");
    const safetyNote = pageStyles.match(/\.coach-chat__safety-note\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(safetyNote).toContain("white-space: nowrap;");
    expect(safetyNote).toContain("text-overflow: ellipsis;");
  });

  it("keeps camera and send buttons enlarged and vertically centered with the input", () => {
    const component = read("src/pages/coach/components/CoachComposer/index.tsx");
    const componentStyles = read("src/pages/coach/components/CoachComposer/index.scss");

    expect(componentStyles).toContain("align-items: center;");
    expect(componentStyles).toContain("align-self: center;");
    expect(componentStyles).toContain("flex: 0 0 52px;");
    expect(componentStyles).toContain("height: 52px;");
    expect(component).toContain('name="camera" size={24}');
    expect(component).toContain('name="arrow-up" size={24}');
  });

  it("disables the send button for both empty input and an externally reached daily limit", () => {
    const component = read("src/pages/coach/components/CoachComposer/index.tsx");

    expect(component).toContain('disabled || (!value.trim() && !selectedImagePath)');
  });
});

describe("coach restart action placement", () => {
  it("keeps restart inside the page content instead of the native capsule area", () => {
    const page = read("src/pages/coach/index.tsx");
    const pageStyles = read("src/styles/page.scss");

    expect(page).not.toContain('topBarAction="重启对话"');
    expect(page).toContain('className="coach-chat__restart-action"');
    expect(pageStyles).toContain(".coach-chat__restart-action");
    expect(pageStyles).toContain(".coach-chat__hero-toolbar");
    const novaKicker = pageStyles.match(/\.coach-chat__hero-kicker\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(novaKicker).toContain("font-size: $font-h3;");
  });
});
