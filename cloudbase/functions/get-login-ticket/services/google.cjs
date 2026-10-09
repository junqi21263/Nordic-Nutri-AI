const { randomUUID } = require("node:crypto");

const DEFAULT_VERIFY_TIMEOUT_MS = 8000;
const DEFAULT_PRIMARY_VERIFY_TIMEOUT_MS = 3000;
const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";
const CLOUDBASE_AUTH_ENDPOINT_SUFFIX = ".api.tcloudbasegateway.com";

function providerUnavailableError(message = "Google token verification is unavailable") {
  const error = new Error(message);
  error.code = "AUTH_PROVIDER_UNAVAILABLE";
  return error;
}

function invalidCredentialsError(reason = "invalid_token") {
  const error = new Error("Google ID token was rejected");
  error.code = "AUTH_INVALID_CREDENTIALS";
  error.authReason = reason;
  return error;
}

function withTimeout(task, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(providerUnavailableError()), Math.max(1, timeoutMs));
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

function requestGoogleTokenInfo(url, timeoutMs) {
  const https = require("https");
  const parsedUrl = new URL(url);
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: "GET",
      family: 4,
      timeout: Math.max(1, timeoutMs),
      headers: { accept: "application/json" },
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        let payload = null;
        try { payload = JSON.parse(body); } catch {}
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          json: async () => payload,
        });
      });
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(Object.assign(new Error("Google tokeninfo request timed out"), { code: "ETIMEDOUT" })));
    request.on("error", reject);
    request.end();
  });
}

function requestCloudbaseAuth({ envId, path, method = "POST", body: requestBody = {}, accessToken, timeoutMs }) {
  const https = require("https");
  const url = new URL(`https://${envId}${CLOUDBASE_AUTH_ENDPOINT_SUFFIX}${path}`);
  const body = method === "GET" ? null : JSON.stringify(requestBody);
  const headers = {
    accept: "application/json",
    "x-device-id": `android-auth-${randomUUID()}`,
  };
  if (body !== null) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(body);
  }
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method,
      family: 4,
      timeout: Math.max(1, timeoutMs),
      headers,
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => {
        let payload = null;
        try { payload = JSON.parse(responseBody); } catch {}
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          json: async () => payload,
        });
      });
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(Object.assign(new Error("CloudBase provider request timed out"), { code: "ETIMEDOUT" })));
    request.on("error", reject);
    if (body !== null) request.write(body);
    request.end();
  });
}

function requestCloudbaseProviderToken({ envId, idToken, timeoutMs }) {
  return requestCloudbaseAuth({
    envId,
    path: "/auth/v1/provider/token",
    body: { provider_id: "google", provider_id_token: idToken },
    timeoutMs,
  });
}

function requestCloudbaseGoogleIdTokenSignIn({ envId, idToken, timeoutMs }) {
  return requestCloudbaseAuth({
    envId,
    path: "/auth/v1/signin/with/provider",
    body: { provider_id: "google", provider_id_token: idToken },
    timeoutMs,
  });
}

function requestCloudbaseUserInfo({ envId, accessToken, timeoutMs }) {
  return requestCloudbaseAuth({
    envId,
    path: "/auth/v1/user/me",
    method: "GET",
    accessToken,
    timeoutMs,
  });
}

function isTransportError(error) {
  if (error?.code === "AUTH_PROVIDER_UNAVAILABLE") return true;
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return ["ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN", "ETIMEDOUT"].includes(code)
    || /network|fetch failed|socket|timed out|timeout|Failed to retrieve verification certificates/i.test(message);
}

function normalizeTokenInfoClaims(payload) {
  return {
    ...payload,
    email_verified: payload.email_verified === true
      || payload.email_verified === "true"
      || payload.verified_email === true
      || payload.verified_email === "true",
  };
}

function googleClaimsFailureReason(payload, clientId) {
  const audiences = Array.isArray(payload?.aud) ? payload.aud : [payload?.aud];
  if (!payload?.sub) return "missing_subject";
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return "issuer_mismatch";
  if (payload.email_verified !== true) return "email_unverified";
  if (!audiences.includes(clientId)) return "audience_mismatch";
  return null;
}

function validateGoogleClaims(payload, clientId) {
  const reason = googleClaimsFailureReason(payload, clientId);
  if (reason) throw invalidCredentialsError(reason);
  return payload;
}

function classifyVerifierError(error) {
  const message = String(error?.message || "");
  if (/No pem found for envelope/i.test(message)) return "signing_key_unknown";
  if (/audience|aud|client.?id|recipient/i.test(message)) return "audience_mismatch";
  if (/expired|too late|exp/i.test(message)) return "token_expired";
  if (/issuer|iss/i.test(message)) return "issuer_mismatch";
  if (/email.*verif|verif.*email/i.test(message)) return "email_unverified";
  return "invalid_token";
}

async function verifyViaTokenInfo({ idToken, timeoutMs, fetchImpl }) {
  if (typeof fetchImpl !== "function") throw providerUnavailableError("Google tokeninfo transport is unavailable");

  const url = new URL(GOOGLE_TOKENINFO_ENDPOINT);
  url.searchParams.set("id_token", idToken);

  let response;
  try {
    response = await withTimeout(
      Promise.resolve().then(() => fetchImpl(url.toString(), { headers: { accept: "application/json" } })),
      timeoutMs,
    );
  } catch (error) {
    if (error?.code === "AUTH_PROVIDER_UNAVAILABLE") throw error;
    throw providerUnavailableError("Google tokeninfo request failed");
  }

  if (!response?.ok) {
    if (Number(response?.status) >= 500 || response?.status == null) {
      throw providerUnavailableError("Google tokeninfo service is unavailable");
    }
    throw invalidCredentialsError();
  }

  let payload;
  try {
    payload = await withTimeout(Promise.resolve().then(() => response.json()), timeoutMs);
  } catch (error) {
    if (error?.code === "AUTH_PROVIDER_UNAVAILABLE") throw error;
    throw providerUnavailableError("Google tokeninfo response is invalid");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw providerUnavailableError("Google tokeninfo response is invalid");
  }
  return normalizeTokenInfoClaims(payload);
}

async function verifyViaCloudbaseProvider({ envId, idToken, clientId, timeoutMs, requestImpl }) {
  if (!envId || typeof requestImpl !== "function") {
    throw providerUnavailableError("CloudBase Google provider is unavailable");
  }

  let response;
  try {
    response = await withTimeout(
      Promise.resolve().then(() => requestImpl({ envId, idToken, timeoutMs })),
      timeoutMs,
    );
  } catch (error) {
    if (error?.code === "AUTH_PROVIDER_UNAVAILABLE") throw error;
    throw providerUnavailableError("CloudBase Google provider request failed");
  }

  if (!response?.ok) {
    if (Number(response?.status) >= 400 && Number(response?.status) < 500) {
      throw invalidCredentialsError("provider_rejected");
    }
    throw providerUnavailableError("CloudBase Google provider is not configured");
  }

  let payload;
  try {
    payload = await withTimeout(Promise.resolve().then(() => response.json()), timeoutMs);
  } catch (error) {
    if (error?.code === "AUTH_PROVIDER_UNAVAILABLE") throw error;
    throw providerUnavailableError("CloudBase Google provider response is invalid");
  }

  const profile = payload?.provider_profile;
  const providerId = profile?.provider_id ?? profile?.provider;
  if (!profile
    || typeof profile !== "object"
    || Array.isArray(profile)
    || (providerId && String(providerId).toLowerCase() !== "google")
    || typeof profile.sub !== "string"
    || !profile.sub.trim()
    || typeof profile.email !== "string"
    || !profile.email.trim()) {
    throw providerUnavailableError("CloudBase Google provider response is invalid");
  }

  // CloudBase Auth performs the configured Google provider verification before
  // returning provider_profile. Mark the trusted profile as verified so the
  // existing app-user/session flow can remain unchanged.
  return {
    sub: String(profile.sub),
    email: String(profile.email),
    email_verified: true,
    iss: "https://accounts.google.com",
    aud: clientId,
    provider: "cloudbase-google-provider",
  };
}

function cloudbaseAuthPayload(payload) {
  if (payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    return payload.data;
  }
  return payload;
}

function cloudbaseGoogleClaims(payload, clientId) {
  const data = cloudbaseAuthPayload(payload);
  const user = data?.user ?? payload?.user;
  const profile = data?.provider_profile ?? payload?.provider_profile ?? user?.provider_profile;
  const providerId = profile?.provider_id ?? profile?.provider;
  if (providerId && String(providerId).toLowerCase() !== "google") {
    throw providerUnavailableError("CloudBase Google sign-in response is invalid");
  }

  const sub = profile?.sub
    ?? profile?.provider_sub
    ?? data?.sub
    ?? payload?.sub
    ?? user?.provider_sub
    ?? user?.providerSub
    ?? user?.id;
  const email = profile?.email ?? user?.email ?? data?.email ?? payload?.email;
  if (typeof sub !== "string" || !sub.trim() || typeof email !== "string" || !email.trim()) {
    throw providerUnavailableError("CloudBase Google sign-in response is invalid");
  }

  return {
    sub: sub.trim(),
    email: email.trim(),
    email_verified: true,
    iss: "https://accounts.google.com",
    aud: clientId,
    provider: "cloudbase-google-id-token",
  };
}

async function verifyViaCloudbaseIdToken({ envId, idToken, clientId, timeoutMs, requestImpl, userInfoRequestImpl }) {
  if (!envId || typeof requestImpl !== "function") {
    throw providerUnavailableError("CloudBase Google ID-token sign-in is unavailable");
  }

  let response;
  try {
    response = await withTimeout(
      Promise.resolve().then(() => requestImpl({ envId, idToken, timeoutMs })),
      timeoutMs,
    );
  } catch (error) {
    if (error?.code === "AUTH_PROVIDER_UNAVAILABLE") throw error;
    throw providerUnavailableError("CloudBase Google ID-token sign-in request failed");
  }

  if (!response?.ok) {
    if (Number(response?.status) >= 400 && Number(response?.status) < 500) {
      throw invalidCredentialsError("provider_rejected");
    }
    throw providerUnavailableError("CloudBase Google ID-token sign-in is not configured");
  }

  let payload;
  try {
    payload = await withTimeout(Promise.resolve().then(() => response.json()), timeoutMs);
  } catch (error) {
    if (error?.code === "AUTH_PROVIDER_UNAVAILABLE") throw error;
    throw providerUnavailableError("CloudBase Google ID-token sign-in response is invalid");
  }
  try {
    return cloudbaseGoogleClaims(payload, clientId);
  } catch (error) {
    const data = cloudbaseAuthPayload(payload);
    const accessToken = data?.access_token
      ?? data?.accessToken
      ?? data?.session?.access_token
      ?? data?.session?.accessToken;
    if (!accessToken || typeof userInfoRequestImpl !== "function") throw error;

    let userResponse;
    try {
      userResponse = await withTimeout(
        Promise.resolve().then(() => userInfoRequestImpl({ envId, accessToken, timeoutMs })),
        timeoutMs,
      );
    } catch (userInfoError) {
      if (userInfoError?.code === "AUTH_PROVIDER_UNAVAILABLE") throw userInfoError;
      throw providerUnavailableError("CloudBase Google user info request failed");
    }
    if (!userResponse?.ok) {
      if (Number(userResponse?.status) >= 400 && Number(userResponse?.status) < 500) {
        throw invalidCredentialsError("provider_rejected");
      }
      throw providerUnavailableError("CloudBase Google user info is unavailable");
    }

    let userPayload;
    try {
      userPayload = await withTimeout(Promise.resolve().then(() => userResponse.json()), timeoutMs);
    } catch (userInfoError) {
      if (userInfoError?.code === "AUTH_PROVIDER_UNAVAILABLE") throw userInfoError;
      throw providerUnavailableError("CloudBase Google user info response is invalid");
    }
    const userInfoData = cloudbaseAuthPayload(userPayload);
    return cloudbaseGoogleClaims({
      ...payload,
      user: userInfoData?.user ?? userInfoData,
    }, clientId);
  }
}

function createGoogleTokenService({
  clientId,
  client,
  timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
  primaryTimeoutMs = DEFAULT_PRIMARY_VERIFY_TIMEOUT_MS,
  fetchImpl,
  cloudbaseAuthEnvId,
  certificatesBaseUrl,
  cloudbaseIdTokenRequest = requestCloudbaseGoogleIdTokenSignIn,
  cloudbaseUserInfoRequest = requestCloudbaseUserInfo,
  cloudbaseProviderRequest = requestCloudbaseProviderToken,
  enableCloudbaseProviderFallback = !certificatesBaseUrl && Boolean(cloudbaseAuthEnvId),
  enableTokenInfoFallback = !certificatesBaseUrl && !client,
} = {}) {
  if (!clientId) throw new Error("Google server client ID is unavailable");
  let endpoints;
  if (certificatesBaseUrl) {
    const base = new URL(certificatesBaseUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
      throw new Error("Google certificates base URL must be an HTTPS origin");
    }
    endpoints = {
      oauth2FederatedSignonPemCertsUrl: `${base.origin}/google/certs/pem`,
      oauth2FederatedSignonJwkCertsUrl: `${base.origin}/google/certs/jwk`,
    };
  }
  const verifier = client || new (require("google-auth-library").OAuth2Client)({ endpoints });
  return {
    async verifyIdToken(idToken) {
      if (typeof idToken !== "string" || !idToken.trim()) throw new Error("Google ID token is unavailable");

      const totalTimeout = Math.max(1, Number(timeoutMs) || DEFAULT_VERIFY_TIMEOUT_MS);
      const primaryTimeout = certificatesBaseUrl ? totalTimeout : Math.max(1, Math.min(totalTimeout, Number(primaryTimeoutMs) || DEFAULT_PRIMARY_VERIFY_TIMEOUT_MS));
      const startedAt = Date.now();
      const verificationAttempts = [];
      const recordFailure = (stage, failure) => {
        verificationAttempts.push({
          stage,
          code: failure?.code === "AUTH_INVALID_CREDENTIALS" ? "AUTH_INVALID_CREDENTIALS" : "AUTH_PROVIDER_UNAVAILABLE",
          reason: failure?.code === "AUTH_INVALID_CREDENTIALS" ? classifyVerifierError(failure) : "verification_unavailable",
        });
      };

      try {
        const ticket = await withTimeout(verifier.verifyIdToken({ idToken, audience: clientId }), primaryTimeout);
        return validateGoogleClaims(ticket.getPayload(), clientId);
      } catch (error) {
        recordFailure("google_library", error);
        if (!isTransportError(error)) {
          if (error?.code === "AUTH_INVALID_CREDENTIALS") throw error;
          throw invalidCredentialsError(classifyVerifierError(error));
        }

        let remainingTimeout = Math.max(1, totalTimeout - (Date.now() - startedAt));
        let cloudbaseError;
        if (enableCloudbaseProviderFallback) {
          const cloudbaseVerifiers = [
            typeof cloudbaseIdTokenRequest === "function" ? {
              stage: "cloudbase_id_token",
              requestImpl: cloudbaseIdTokenRequest,
              verify: verifyViaCloudbaseIdToken,
            } : null,
            typeof cloudbaseProviderRequest === "function" ? {
              stage: "cloudbase_provider_token",
              requestImpl: cloudbaseProviderRequest,
              verify: verifyViaCloudbaseProvider,
            } : null,
          ].filter(Boolean);
          for (const verifierConfig of cloudbaseVerifiers) {
            try {
              const payload = await verifierConfig.verify({
                envId: cloudbaseAuthEnvId,
                idToken,
                clientId,
                timeoutMs: remainingTimeout,
                requestImpl: verifierConfig.requestImpl,
                userInfoRequestImpl: cloudbaseUserInfoRequest,
              });
              return validateGoogleClaims(payload, clientId);
            } catch (providerError) {
              recordFailure(verifierConfig.stage, providerError);
              cloudbaseError = providerError;
              remainingTimeout = Math.max(1, totalTimeout - (Date.now() - startedAt));
            }
          }
        }

        if (enableTokenInfoFallback) {
          try {
            const payload = await verifyViaTokenInfo({
              idToken,
              timeoutMs: remainingTimeout,
              fetchImpl: fetchImpl || ((url) => requestGoogleTokenInfo(url, remainingTimeout)),
            });
            return validateGoogleClaims(payload, clientId);
          } catch (tokenInfoError) {
            recordFailure("google_tokeninfo", tokenInfoError);
            tokenInfoError.verificationAttempts = verificationAttempts;
            throw tokenInfoError;
          }
        }
        if (cloudbaseError) throw cloudbaseError;
        const unavailable = providerUnavailableError("Google public certificates are unavailable");
        unavailable.verificationAttempts = verificationAttempts;
        throw unavailable;
      }
    },
  };
}

module.exports = { createGoogleTokenService };
