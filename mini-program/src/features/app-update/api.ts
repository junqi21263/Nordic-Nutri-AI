import { trackAnalytics } from "../analytics/runtime";
import { productTransport } from "../../platform/product-transport";
import { productApiEndpoint } from "../../api/product-api-config";
import type { AppUpdateChannel, AppVersionResponse } from "./types";

export async function fetchLatestAndroidRelease(channel: AppUpdateChannel): Promise<AppVersionResponse> {
  const response = await productTransport<AppVersionResponse>({
    url: `${productApiEndpoint}/app/version?channel=${channel}`,
    method: "GET",
    header: { "cache-control": "no-store, no-cache", pragma: "no-cache" },
    timeout: 10_000,
    enableCache: false,
  });
  if (response.statusCode !== 200) throw new Error("App version lookup failed");
  trackAnalytics("update_checked", { outcome: "succeeded", ...(response.data.update?.versionName ? { target_version: response.data.update.versionName } : {}) });
  return response.data;
}
