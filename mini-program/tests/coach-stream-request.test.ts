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
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    useAuthStore.getState().clear();
  });

  it("reads Android UTF-8 NDJSON with split bytes and a final event without newline", async () => {
    vi.stubEnv("TARO_ENV", "h5");
    const bytes = encoder.encode('{"type":"delta","text":"早餐"}\n' + completeEvent());
    const request = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 25));
        controller.enqueue(bytes.slice(25));
        controller.close();
      },
    })));
    vi.stubGlobal("fetch", request);
    const events: unknown[] = [];
    await streamProductCoachMessage("早餐", "2026-09-10", (event) => events.push(event), "request-1").promise;
    expect(events).toEqual([{ type: "delta", text: "早餐" }, JSON.parse(completeEvent())]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string)).toMatchObject({ clientRequestId: "request-1" });
  });

  it("does not retry an interrupted Android response", async () => {
    vi.stubEnv("TARO_ENV", "h5");
    const request = vi.fn(async () => new Response('{"type":"delta","text":"早餐"}\n'));
    vi.stubGlobal("fetch", request);
    await expect(streamProductCoachMessage("早餐", "2026-09-10", () => undefined).promise).rejects.toThrow("回复中断");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("allows pre-request fallback when streaming is unavailable", async () => {
    vi.stubEnv("TARO_ENV", "h5");
    vi.stubGlobal("ReadableStream", undefined);
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(streamProductCoachMessage("早餐", "2026-09-10", () => undefined).promise).rejects.toMatchObject({ name: "COACH_STREAM_UNSUPPORTED" });
    expect(request).not.toHaveBeenCalled();
  });

  it("aborts the Android request without emitting late events", async () => {
    vi.stubEnv("TARO_ENV", "h5");
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const onEvent = vi.fn();
    const stream = streamProductCoachMessage("早餐", "2026-09-10", onEvent);
    stream.abort();
    await expect(stream.promise).rejects.toMatchObject({ name: "COACH_STREAM_ABORTED" });
    expect(onEvent).not.toHaveBeenCalled();
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
