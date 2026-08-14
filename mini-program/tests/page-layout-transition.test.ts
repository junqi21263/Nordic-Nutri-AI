import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(process.cwd(), "src");
const read = (path: string) => readFileSync(resolve(srcRoot, path), "utf8");

describe("page layout transition", () => {
  it("uses one short content entrance after WeChat navigation without changing route APIs", () => {
    const layout = read("layouts/page-layout/index.tsx");
    const styles = read("styles/layout.scss");

    expect(layout).toContain('pageVisible && !disablePageEnterAnimation ? "page-layout__scroll--entered" : ""');
    expect(styles).toContain(".page-layout__scroll--entered");
    expect(styles).toContain("page-layout-content-enter 180ms");
    expect(styles).toContain("translateY(6px)");
  });
});
