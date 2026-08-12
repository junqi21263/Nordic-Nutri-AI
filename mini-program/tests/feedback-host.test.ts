import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("FeedbackHost modal priority", () => {
  it("renders the modal before any toast and clears late toasts", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/components/feedback-host/index.tsx"), "utf8");
    expect(source).toContain("if (modal) return <FeedbackModal");
    expect(source).toContain("if (modal && toast) clear()");
    expect(source).toContain("onDismiss={closeModal}");
    expect(source).toContain("if (!enabled) return null");
  });

  it("mounts the feedback host inside the active PageLayout tree", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/layouts/page-layout/index.tsx"), "utf8");
    expect(source).toContain('import { FeedbackHost } from "../../components/feedback-host";');
    expect(source).toContain("<FeedbackHost enabled={pageVisible} />");
  });
});
