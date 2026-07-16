import type { AppEnvironment } from "../api/environment";
import type { RepositoryMode } from "./types";

export function selectRuntimeAdapter(config: {
  environment: AppEnvironment;
  useRealBackend: boolean;
}): RepositoryMode {
  return config.environment === "development" && config.useRealBackend
    ? "supabase"
    : "fixture";
}
