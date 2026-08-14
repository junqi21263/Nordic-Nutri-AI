import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("milestone poster exporter state", () => {
  it("stores the exporter function instead of letting React execute it as a state updater", () => {
    const page = readFileSync(resolve(process.cwd(), "src/pages/milestone-poster/index.tsx"), "utf8");
    expect(page).toContain("setExporter(() => nextExporter)");
  });

  it("keeps the Canvas ready callback stable so image loading is not restarted on every render", () => {
    const page = readFileSync(resolve(process.cwd(), "src/pages/milestone-poster/index.tsx"), "utf8");
    expect(page).toContain("const handleExporterReady = useCallback");
    expect(page).toContain("onReady={handleExporterReady}");
  });
});
