# Google public-key relay (DEV)

Worker: `nordic-google-public-keys-dev`

DEV origin: `https://google-keys-dev.lewislee.online` (dedicated Worker custom domain). The default workers.dev hostname timed out from CloudBase; do not use it for the backend setting.

2026-09-08 verification: Worker HTTPS returned 200; DEV configuration read back Active with the custom origin. A deliberately invalid, unknown-key test token returned 401 in 1740 ms instead of the previous 8-second provider-unavailable timeout (trace `trace_4db14a68-c876-454f-a7be-b7f653921481`). All 39 focused Worker/backend auth tests passed. Real-device Google account login remains user acceptance, not verified by this probe.

Supported requests are `GET /google/certs/pem` and `GET /google/certs/jwk`, without query parameters, plus the server-only `POST /fcm/send` route. The certificate routes fetch fixed Google HTTPS certificate endpoints. The FCM route requires the Worker Secret `FCM_RELAY_SHARED_SECRET`, accepts only a signed service-account assertion plus a single FCM message, exchanges the assertion at the fixed Google OAuth endpoint, and sends to the fixed FCM HTTP v1 endpoint. It never stores the Firebase private key, accepts caller-controlled upstream URLs, or writes request bodies to logs. Certificate caching follows Google's cache headers; response max-age subtracts upstream Age and is capped at one hour. Failures return an uncacheable 503.

The CloudBase `get-login-ticket` function accepts the server-only setting `GOOGLE_CERTIFICATES_BASE_URL` (an HTTPS origin) for Google login verification and `FCM_RELAY_URL` plus `FCM_RELAY_SHARED_SECRET` for DEV FCM delivery. When the certificate setting is present, the existing Google auth library retrieves certificates from the relay and verifies signature, audience, issuer and expiration locally. When the FCM relay settings are present, the function signs a short-lived service-account assertion locally and sends it to the relay; the Firebase private key does not cross the relay. The original Google subject remains the user identifier. Legacy CloudBase provider/tokeninfo fallbacks are disabled in certificate-relay mode. Fetch failures fail closed.

Deploy using Wrangler 4: `wrangler deploy --config wrangler.jsonc`. Inspect the current Cloudflare account with `wrangler whoami` first. Run `node --test worker.test.mjs` for routing/cache tests. Backend `services/google-certificates.test.mjs` additionally requires the existing `google-auth-library` dependency and exercises real RSA signatures.

Before enabling the setting, compare relay certificates with Google's current certificates. After deployment, verify connectivity from CloudBase itself; local access does not prove cloud connectivity. Never hardcode certificates, disable TLS verification, or accept decoded but unverified token claims. This Worker is part of the authentication trust boundary; restrict account deployment access accordingly.
