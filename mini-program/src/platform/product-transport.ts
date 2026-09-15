import Taro from "@tarojs/taro";

export async function productTransport<T>(options: Taro.request.Option): Promise<{ data: T; statusCode: number }> {
  if (process.env.TARO_APP_PLATFORM === "android") {
    const { Capacitor, CapacitorHttp } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.request({
        url: options.url,
        method: options.method ?? "GET",
        headers: options.header,
        data: options.data,
        responseType: "json",
        connectTimeout: options.timeout ?? 15_000,
        readTimeout: options.timeout ?? 15_000,
      });
      return { data: response.data as T, statusCode: response.status };
    }
  }
  return Taro.request<T>(options);
}
