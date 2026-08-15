import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("FeedbackModal contract", () => {
  const component = () => readFileSync(resolve(import.meta.dirname, "../src/components/feedback-modal/index.tsx"), "utf8");
  const styles = () => readFileSync(resolve(import.meta.dirname, "../src/styles/components.scss"), "utf8");

  it("renders one shared fixed overlay for the three variants", () => {
    const source = component();
    const styleSource = styles();

    expect(source).toContain('variant: "success" | "limit" | "error"');
    expect(source).toContain('import { NordicIcon } from "../nordic-icon"');
    expect(source).toContain('<NordicIcon name="check" size={52} ariaLabel="成功" />');
    expect(source).toContain('<NordicIcon name="hourglass" size={52} ariaLabel="额度提示" />');
    expect(source).toContain("feedback-modal-overlay");
    expect(source).toContain("feedback-modal--success");
    expect(source).toContain("feedback-modal--limit");
    expect(source).toContain("feedback-modal--error");
    expect(styleSource).toContain("max-width: 700px");
    expect(styleSource).toContain("width: calc(100% - #{$space-20})");
  });

  it("slows the shared motion and leaves button-confirmed dialogs without a corner close", () => {
    const source = styles();
    const componentSource = component();

    expect(source).toContain("feedback-modal-overlay-enter 420ms");
    expect(source).toContain("feedback-modal-success 520ms");
    expect(source).toContain("feedback-modal-limit 460ms");
    expect(source).toContain("feedback-modal-error 520ms");
    expect(source).toContain("feedback-modal-overlay-exit 420ms");
    expect(source).toContain("feedback-modal-success-icon 700ms ease-out 180ms");
    expect(componentSource).toContain('<NordicIcon name="check" size={52} ariaLabel="成功" />');
    expect(componentSource).toContain("modal.dismissible && !modal.primaryText");
    expect(source).toContain("translateX(-3px)");
    expect(source).toContain("translateX(3px)");
    expect(source).toContain("background: #e4e2df");
    expect(source).toContain("background: #69716b");
  });

  it("keeps modal copy on one line and centers compact actions", () => {
    const source = styles();
    const componentSource = component();

    expect(componentSource).toContain('modal.primaryText === "好的" ? "feedback-modal__button--short" : ""');
    expect(source).toContain("white-space: nowrap");
    expect(source).toContain("font-size: $font-caption");
    expect(source).toContain("align-items: center");
    expect(source).toContain(".feedback-modal__button--short");
    expect(source).toContain("width: 360px");
    expect(source).toContain(".feedback-modal__button {");
  });
});
