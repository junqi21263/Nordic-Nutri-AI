function readOptionalString(env, name) {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readApiTestConfig(env = process.env) {
  const apiBaseUrl = readOptionalString(env, "API_BASE_URL");
  if (!apiBaseUrl) throw new Error("API_BASE_URL is required");

  let parsedUrl;
  try {
    parsedUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error("API_BASE_URL must be an absolute URL");
  }
  if (parsedUrl.protocol !== "https:") throw new Error("API_BASE_URL must use HTTPS");

  const allowPersistentWrites = env.ALLOW_PERSISTENT_WRITES === "1";
  if (allowPersistentWrites && env.TEST_ENV_CONFIRMATION !== "sandbox") {
    throw new Error("TEST_ENV_CONFIRMATION must equal sandbox when persistent writes are enabled");
  }

  return {
    apiBaseUrl: parsedUrl.toString().replace(/\/$/, ""),
    allowPersistentWrites,
    productTokenA: readOptionalString(env, "TEST_PRODUCT_TOKEN_A"),
    productTokenB: readOptionalString(env, "TEST_PRODUCT_TOKEN_B"),
    runId: readOptionalString(env, "TEST_RUN_ID"),
  };
}

export function requireProductTokens(config) {
  if (!config?.productTokenA || !config?.productTokenB) {
    throw new Error("TEST_PRODUCT_TOKEN_A and TEST_PRODUCT_TOKEN_B are required for authenticated suites");
  }
  return { tokenA: config.productTokenA, tokenB: config.productTokenB };
}
