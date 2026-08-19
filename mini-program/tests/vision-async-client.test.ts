import { describe, expect, it } from "vitest";
import {
  isVisionTerminalStatus,
  isRetryableVisionStatusError,
  nextVisionPollDelay,
  normalizeVisionStatus,
} from "../src/features/scanner/vision-async-client";

describe("vision async client contract", () => {
  it("normalizes processing and terminal server states", () => {
    expect(normalizeVisionStatus({ status: "processing", analysisId: "a" }).status).toBe("processing");
    expect(normalizeVisionStatus({ status: "analyzing", analysisId: "a" })).toMatchObject({
      status: "processing",
      currentStage: "analyzing",
    });
    expect(normalizeVisionStatus({ status: "enriching", analysisId: "a" })).toMatchObject({
      status: "processing",
      currentStage: "enriching",
    });
    expect(normalizeVisionStatus({ status: "persisting", analysisId: "a" })).toMatchObject({
      status: "processing",
      currentStage: "persisting",
    });
    expect(normalizeVisionStatus({ status: "completed", analysisId: "a", result: {} }).status).toBe("completed");
    expect(normalizeVisionStatus({ status: "timed_out", analysisId: "a", errorCode: "VISION_TIMEOUT" }).status).toBe("timed_out");
    expect(isVisionTerminalStatus("completed")).toBe(true);
    expect(isVisionTerminalStatus("processing")).toBe(false);
  });

  it("backs off polling without exceeding the maximum delay", () => {
    expect(nextVisionPollDelay(0)).toBe(1500);
    expect(nextVisionPollDelay(1)).toBe(2250);
    expect(nextVisionPollDelay(8)).toBe(5000);
    expect(nextVisionPollDelay(99)).toBe(5000);
  });

  it("only retries transient status-fetch failures during async recovery", () => {
    expect(isRetryableVisionStatusError({ name: "VISION_STATUS_FAILED" })).toBe(true);
    expect(isRetryableVisionStatusError({ name: "VISION_NETWORK_ERROR" })).toBe(true);
    expect(isRetryableVisionStatusError({ name: "VISION_STATUS_INVALID" })).toBe(false);
    expect(isRetryableVisionStatusError({ name: "VISION_NOT_FOUND" })).toBe(false);
  });
});
