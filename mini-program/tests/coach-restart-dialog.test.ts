import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("coach restart dialog", () => {
  it("locks the coach page while the new-conversation dialog is open", () => {
    const page = read("src/pages/coach/index.tsx");

    expect(page).toContain("scrollLocked={restartDialogOpen}");
  });

  it("enables touch scrolling protection for confirmation dialogs", () => {
    const dialog = read("src/components/confirm-dialog/index.tsx");

    expect(dialog).toContain("<Modal open={open} lockScroll>");
  });

  it("keeps the confirmation copy and action label on one line", () => {
    const styles = read("src/styles/components.scss");

    expect(styles).toContain(".confirm-dialog__description {");
    expect(styles).toMatch(/\.confirm-dialog__description\s*\{[\s\S]*?white-space: nowrap;/);
    expect(styles).toMatch(/\.confirm-dialog__actions \.app-button\s*\{[\s\S]*?white-space: nowrap;/);
  });

  it("lets the modal backdrop extend over the fixed bottom tab bar", () => {
    const page = read("src/pages/coach/index.tsx");
    const layout = read("src/layouts/page-layout/index.tsx");
    const layoutStyles = read("src/styles/layout.scss");
    const componentStyles = read("src/styles/components.scss");

    expect(page).toContain("overlay={");
    expect(layout).toContain("overlay?: ReactNode;");
    expect(layout).toContain("{overlay}");
    expect(layoutStyles).toMatch(/\.page-layout--scroll-locked \.page-layout__scroll[\s\S]*?overflow: visible;/);
    expect(componentStyles).toContain("background: rgba($color-text-primary, 0.52);");
  });
});
