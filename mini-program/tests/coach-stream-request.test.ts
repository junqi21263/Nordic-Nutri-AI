import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../src/auth/auth-store";
import { streamProductCoachMessage } from "../src/api/coach-api";

vi.mock("@tarojs/taro", () => ({ default: {} }));

const encoder = new TextEncoder();

function completeEvent() {
  return JSON.stringify({
    type: "complete",
    conversationId: "conversation-1",
    messages: [],
    reply: { priority: "logging" },
  });
}

describe("coach stream request framing", () => {
  beforeEach(() => {
    useAuthStore.getState().setSession({
      user: { id: "user-1" },
      accessToken: "token-1",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().clear();
  });

  it("preserves UTF-8 text when one character is split across chunks", async () => {
    let onChunk: ((result: { data: ArrayBuffer }) => void) | undefined;
    const request = vi.fn((options: { success: (result: { statusCode: number }) => void }) => {
      const task = {
        abort: vi.fn(),
        onChunkReceived: (callback: (result: { data: ArrayBuffer }) => void) => {
          onChunk = callback;
        },
      };
      queueMicrotask(() => {
        const bytes = encoder.encode('{"type":"delta","text":"早餐"}\n');
        onChunk?.({ data: bytes.slice(0, 25).buffer });
        onChunk?.({ data: bytes.slice(25).buffer });
        options.success({ statusCode: 200 });
      });
      return task;
    });
    vi.stubGlobal("wx", { request });

    const events: unknown[] = [];
    const stream = streamProductCoachMessage("早餐吃什么？", "2026-09-03", (event) => events.push(event));
    await stream.promise;

    expect(events).toEqual([{ type: "delta", text: "早餐" }]);
  });

  it("flushes the final event when the response has no trailing newline", async () => {
    let onChunk: ((result: { data: ArrayBuffer }) => void) | undefined;
    const request = vi.fn((options: { success: (result: { statusCode: number }) => void }) => {
      const task = {
        abort: vi.fn(),
        onChunkReceived: (callback: (result: { data: ArrayBuffer }) => void) => {
          onChunk = callback;
        },
      };
      queueMicrotask(() => {
        onChunk?.({ data: encoder.encode(completeEvent()).buffer });
        options.success({ statusCode: 200 });
      });
      return task;
    });
    vi.stubGlobal("wx", { request });

    const events: unknown[] = [];
    const stream = streamProductCoachMessage("早餐", "2026-09-03", (event) => events.push(event));
    await stream.promise;

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "complete", conversationId: "conversation-1" });
  });
});
