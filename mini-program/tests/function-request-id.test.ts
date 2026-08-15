import { describe, expect, it } from "vitest";
import { extractFunctionDiagnostics } from "../src/api/function-request-id";

describe("function request user-facing messages", () => {
  it("uses the current-cap copy for rate limiting", async () => {
    const diagnostics = await extractFunctionDiagnostics({ code: "RATE_LIMITED", status: 429 });

    expect(diagnostics.message).toBe("识别次数已达到当前上限，请稍后再试");
  });
});
