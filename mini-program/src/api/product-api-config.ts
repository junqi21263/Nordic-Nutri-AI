const configuredApiBaseUrl = (process.env.TARO_APP_API_BASE_URL ?? "").trim().replace(/\/$/, "");

export const productApiEndpoint = configuredApiBaseUrl
  ? `${configuredApiBaseUrl}/get-login-ticket`
  : "https://lewis-healthy-d4glgqqzv73a5bc10.service.tcloudbase.com/get-login-ticket";
