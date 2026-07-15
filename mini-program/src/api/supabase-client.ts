import type { RequestAdapter } from "./request-adapter";
import { getPublicRuntimeConfig, type PublicRuntimeConfig } from "./environment";

export interface SupabaseClientBoundary {
  config: PublicRuntimeConfig;
  requestAdapter?: RequestAdapter;
}

export function createSupabaseClientBoundary(
  config: PublicRuntimeConfig = getPublicRuntimeConfig(),
  requestAdapter?: RequestAdapter,
): SupabaseClientBoundary {
  return { config, requestAdapter };
}

export function hasSupabasePublicConfig(config: PublicRuntimeConfig): boolean {
  return Boolean(config.supabaseUrl && config.supabasePublishableKey);
}
