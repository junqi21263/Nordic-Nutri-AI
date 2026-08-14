import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const posterSource = readFileSync(resolve(process.cwd(), "src/components/milestone-poster/index.tsx"), "utf8");
const pageStyles = readFileSync(resolve(process.cwd(), "src/styles/page.scss"), "utf8");

describe("milestone poster share action", () => {
  it("uses a share glyph with contrast on the forest-green button", () => {
    expect(posterSource).toContain('name="share"');
    expect(posterSource).toContain('name="share" size={22}');
    expect(pageStyles).toContain(".milestone-poster__share .nordic-icon");
    expect(pageStyles).toContain(".milestone-poster__share > Text");
    expect(pageStyles).toContain("left: calc(50% - 132px);");
    expect(pageStyles).toContain(".milestone-poster__continue {");
    expect(pageStyles).toContain("align-self: stretch;");
  });
});
