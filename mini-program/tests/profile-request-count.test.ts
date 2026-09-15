import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("requests weekly review on show and explicit refresh, not also on mount", () => {
  const page = readFileSync(resolve(import.meta.dirname, "../src/pages/profile/index.tsx"), "utf8");
  expect(page.match(/getProductWeeklyReview\(date/g)).toHaveLength(2);
});
