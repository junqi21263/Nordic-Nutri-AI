import Taro from "@tarojs/taro";

type VConsoleNetworkItem = Record<string, unknown>;
type VConsoleNetwork = {
  add: (item: VConsoleNetworkItem) => { id?: string };
  update: (id: string, item: VConsoleNetworkItem) => void;
};

declare global {
  interface Window {
    __VCONSOLE_INSTANCE?: { network?: VConsoleNetwork };
  }
}

function redactNetworkValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactNetworkValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /^(authorization|accessToken|refreshToken|idToken|password|captchaAnswer)$/i.test(key)
      ? "[redacted]"
      : redactNetworkValue(item),
  ]));
}

function beginNativeNetworkRecord(options: Taro.request.Option, startTime: number) {
  try {
    const network = typeof window === "undefined" ? undefined : window.__VCONSOLE_INSTANCE?.network;
    if (!network) return undefined;
    const item = network.add({
      url: options.url,
      method: options.method ?? "GET",
      status: "Pending",
      statusText: "Pending",
      requestType: "custom",
      header: {},
      requestHeader: redactNetworkValue(options.header ?? {}),
      responseType: "json",
      startTime,
    });
    return typeof item?.id === "string" ? { network, id: item.id } : undefined;
  } catch {
    return undefined;
  }
}

function finishNativeNetworkRecord(
  entry: ReturnType<typeof beginNativeNetworkRecord>,
  item: VConsoleNetworkItem,
) {
  if (!entry) return;
  try {
    entry.network.update(entry.id, item);
  } catch {
    // VConsole is optional diagnostics and must not affect API requests.
  }
}

export async function productTransport<T>(options: Taro.request.Option): Promise<{ data: T; statusCode: number }> {
  if (process.env.TARO_APP_PLATFORM === "android") {
    const { Capacitor, CapacitorHttp } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const startedAt = Date.now();
      const networkRecord = beginNativeNetworkRecord(options, startedAt);
      let response;
      try {
        response = await CapacitorHttp.request({
          url: options.url,
          method: options.method ?? "GET",
          headers: options.header,
          data: options.data,
          responseType: "json",
          connectTimeout: options.timeout ?? 15_000,
          readTimeout: options.timeout ?? 15_000,
        });
      } catch (error) {
        finishNativeNetworkRecord(networkRecord, {
          status: "Error",
          statusText: "Network Error",
          response: { error: "request failed" },
          readyState: 4,
          endTime: Date.now(),
          costTime: Date.now() - startedAt,
        });
        throw error;
      }
      finishNativeNetworkRecord(networkRecord, {
        status: response.status,
        statusText: response.status >= 200 && response.status < 300 ? "OK" : "HTTP Error",
        response: redactNetworkValue(response.data),
        readyState: 4,
        endTime: Date.now(),
        costTime: Date.now() - startedAt,
      });
      return { data: response.data as T, statusCode: response.status };
    }
  }
  return Taro.request<T>(options);
}
