export interface WechatRequestTask {
  abort: () => void;
}

export interface WechatRequestResult {
  statusCode: number;
  data: unknown;
  header?: Record<string, unknown>;
}

export interface WechatRequestOptions {
  url: string;
  method?: string;
  header?: Record<string, string>;
  data?: unknown;
  timeout?: number;
  success?: (result: WechatRequestResult) => void;
  fail?: (error: { errMsg?: string }) => void;
}

export type WechatRequest = (options: WechatRequestOptions) => WechatRequestTask;

type HeadersLike = { forEach?: (callback: (value: string, key: string) => void) => void };

/**
 * Minimal WHATWG Headers implementation for the WeChat JavaScript runtime.
 * supabase-js constructs Headers before it reaches the injected fetch adapter.
 */
export class WechatHeaders {
  private readonly values = new Map<string, string>();

  constructor(headers?: HeadersInit) {
    if (!headers) return;
    if (Array.isArray(headers)) {
      headers.forEach(([key, value]) => this.set(key, value));
      return;
    }
    if (typeof (headers as HeadersLike).forEach === "function") {
      (headers as HeadersLike).forEach?.((value, key) => this.set(key, value));
      return;
    }
    Object.entries(headers as Record<string, unknown>).forEach(([key, value]) => this.set(key, String(value)));
  }

  get(name: string): string | null {
    return this.values.get(name.toLowerCase()) ?? null;
  }

  has(name: string): boolean {
    return this.values.has(name.toLowerCase());
  }

  set(name: string, value: string): void {
    this.values.set(name.toLowerCase(), String(value));
  }

  append(name: string, value: string): void {
    const key = name.toLowerCase();
    const current = this.values.get(key);
    this.values.set(key, current ? `${current}, ${value}` : String(value));
  }

  delete(name: string): void {
    this.values.delete(name.toLowerCase());
  }

  forEach(callback: (value: string, key: string, parent: WechatHeaders) => void): void {
    this.values.forEach((value, key) => callback(value, key, this));
  }

  entries(): IterableIterator<[string, string]> {
    return this.values.entries();
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }
}

/** Returns true only when the WeChat runtime needed a Headers compatibility shim. */
export function installWechatHeadersCompat(runtime: typeof globalThis = globalThis): boolean {
  if (typeof runtime.Headers === "function") return false;
  (runtime as unknown as { Headers: typeof Headers }).Headers = WechatHeaders as unknown as typeof Headers;
  return true;
}

function toHeaders(init?: HeadersInit): Record<string, string> {
  if (!init) return {};
  if (Array.isArray(init)) return Object.fromEntries(init.map(([key, value]) => [key, String(value)]));
  if (typeof (init as Headers).forEach === "function") {
    const headers: Record<string, string> = {};
    (init as Headers).forEach((value, key) => { headers[key] = value; });
    return headers;
  }
  return Object.fromEntries(Object.entries(init as Record<string, string>).map(([key, value]) => [key, String(value)]));
}

function toText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data === undefined || data === null) return "";
  return JSON.stringify(data);
}

function abortError(): Error {
  const error = new Error("请求已取消");
  error.name = "AbortError";
  return error;
}

function networkError(): Error {
  const error = new Error("微信网络请求失败");
  error.name = "WechatFetchError";
  return error;
}

function requestStartError(): Error {
  const error = new Error("微信网络请求未能启动");
  error.name = "WechatRequestStartError";
  return error;
}

function responseFrom(result: WechatRequestResult, url: string): Response {
  const body = toText(result.data);
  const headers = new WechatHeaders(result.header as Record<string, string> | undefined) as unknown as Headers;
  return {
    ok: result.statusCode >= 200 && result.statusCode < 300,
    status: result.statusCode,
    statusText: "",
    url,
    headers,
    body: null,
    bodyUsed: false,
    redirected: false,
    type: "basic",
    clone: () => responseFrom(result, url),
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
  } as Response;
}

/**
 * Adapts the WeChat mini-program request API to the fetch surface consumed by
 * supabase-js. The adapter deliberately never logs request input or headers.
 */
export function createWechatFetch(request: WechatRequest, defaultTimeoutMs = 15_000): typeof fetch {
  return ((input: RequestInfo | URL, init: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
    const url = typeof input === "string" ? input : input.toString();
    const signal = init.signal;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    let settled = false;
    let task: WechatRequestTask | null = null;
    const onAbort = () => {
      task?.abort();
      settle(() => reject(abortError()));
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    try {
      task = request({
        url,
        method: init.method ?? "GET",
        header: toHeaders(init.headers),
        data: init.body ?? undefined,
        timeout: defaultTimeoutMs,
        success: (result) => settle(() => resolve(responseFrom(result, url))),
        fail: () => settle(() => reject(networkError())),
      });
    } catch {
      settle(() => reject(requestStartError()));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  })) as typeof fetch;
}

export function getWechatFetch(): typeof fetch {
  const miniProgram = globalThis as typeof globalThis & { wx?: { request?: WechatRequest } };
  if (typeof miniProgram.wx?.request !== "function") {
    const error = new Error("微信网络能力不可用");
    error.name = "WechatFetchUnavailableError";
    throw error;
  }
  return createWechatFetch(miniProgram.wx.request.bind(miniProgram.wx));
}
