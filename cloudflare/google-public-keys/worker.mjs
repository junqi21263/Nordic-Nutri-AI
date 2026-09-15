// Only fixed Google endpoints cross this relay; never forward caller-controlled URLs.
const SOURCES = new Map([
  ["/google/certs/pem", "https://www.googleapis.com/oauth2/v1/certs"],
  ["/google/certs/jwk", "https://www.googleapis.com/oauth2/v3/certs"],
]);
const OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FCM_ENDPOINT = "https://fcm.googleapis.com/v1/projects";
const MAX_FCM_BODY_BYTES = 64 * 1024;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function handleFcmSend(request, env, url) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (url.search || !env?.FCM_RELAY_SHARED_SECRET) return new Response(null, { status: 404 });
  if (request.headers.get("X-FCM-Relay-Secret") !== env.FCM_RELAY_SHARED_SECRET) {
    return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_FCM_BODY_BYTES) return jsonResponse({ error: { code: "REQUEST_TOO_LARGE" } }, 413);
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: { code: "REQUEST_INVALID" } }, 400);
  }
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const assertion = typeof body?.assertion === "string" ? body.assertion.trim() : "";
  const message = body?.message;
  if (!/^[a-z0-9][a-z0-9-]{4,62}$/.test(projectId) || assertion.length < 32 || assertion.length > 8192 || !message || typeof message !== "object" || Array.isArray(message) || typeof message.token !== "string" || !message.token.trim()) {
    return jsonResponse({ error: { code: "REQUEST_INVALID" } }, 400);
  }

  try {
    const tokenResponse = await fetch(OAUTH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    const tokenBody = await tokenResponse.json().catch(() => ({}));
    const accessToken = typeof tokenBody?.access_token === "string" ? tokenBody.access_token.trim() : "";
    if (!tokenResponse.ok || !accessToken) return jsonResponse({ error: { code: "FCM_RELAY_AUTH_FAILED" } }, 503);

    const fcmResponse = await fetch(`${FCM_ENDPOINT}/${encodeURIComponent(projectId)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(8000),
    });
    const fcmBody = await fcmResponse.json().catch(() => ({}));
    return jsonResponse(fcmBody, fcmResponse.status);
  } catch (error) {
    console.error(JSON.stringify({ event: "fcm_relay_failed", name: error?.name, code: error?.code }));
    return jsonResponse({ error: { code: "FCM_RELAY_UNAVAILABLE" } }, 503);
  }
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname === "/fcm/send") return handleFcmSend(request, env, url);
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
    const source = SOURCES.get(url.pathname);
    if (!source || url.search) return new Response(null, { status: 404 });
    try {
      const upstream = await fetch(source, {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        cf: { cacheEverything: true },
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        return new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "X-Upstream-Status": String(upstream.status) } });
      }
      const maxAge = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(upstream.headers.get("cache-control") || "")?.[1] || 0);
      const age = Number(upstream.headers.get("age") || 0);
      // Google auth-library caches max-age without subtracting Age itself.
      const remaining = Math.max(0, Math.floor(Math.min(3600, maxAge - age)));
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": Number.isFinite(remaining) && remaining > 0 ? `public, max-age=${remaining}, must-revalidate` : "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error(JSON.stringify({ event: "google_certificates_fetch_failed", name: error?.name, message: error?.message }));
      return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  },
};
