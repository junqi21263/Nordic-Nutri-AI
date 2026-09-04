# Android independent authentication design

## Status and scope

This design creates the first Android-only authentication slice for Nordic Nutri AI. It keeps the existing WeChat Mini Program login and its users unchanged. Android accounts are new product users and do not inherit or merge Mini Program data.

The implementation runs only from the `Android-dev` branch and targets the existing DEV CloudBase environment first. It does not deploy to production, modify the Mini Program release, enable vendor accounts, or put provider secrets in source control.

## Decision

Android authentication is independently integrated into the existing CloudBase HTTP function. It does not use CloudBase App Auth.

| Method | Client responsibility | Server responsibility |
| --- | --- | --- |
| Google | Android native Credential Manager obtains a Google ID token. | Verify token signature, issuer, audience and expiry; map Google `sub` to a product user. |
| Email | Submit an email address and user-entered code. | Generate, rate-limit and verify a code; deliver it through Brevo. |
| Phone | Submit an E.164 phone number and user-entered code. | Generate, rate-limit and verify a code; deliver it through httpSMS. |

Every successful login returns the existing product-session response shape:

```json
{
  "user": { "id": "product-user-uuid" },
  "session": { "accessToken": "existing-product-session" },
  "onboardingRequired": true
}
```

The existing Bearer token verifier remains the authorization boundary for all product APIs. Android clients do not receive CloudBase API keys, database credentials, AI-provider keys, Brevo keys, httpSMS keys, or Google server credentials.

## Data model

Add a forward-only migration containing:

1. `app_users.client_platform`, constrained to `wechat_mini_program` or `android_app`.
   - Existing rows are backfilled as `wechat_mini_program`.
   - Android creation always writes `android_app` on the server; the client cannot choose it.
2. `app_user_identities` for Android authentication identities.
   - `user_id` references `app_users(id)` with cascading delete.
   - `provider` is `google`, `email`, or `phone`.
   - `subject_hash` is an HMAC of a normalized provider subject, never the raw Google subject, email address, or phone number.
   - `(provider, subject_hash)` is unique.
3. `auth_challenges` for pending email and phone codes.
   - Stores destination hash, channel, code hash, expiry, failed-attempt count, send count, and consumed timestamp.
   - Stores no plaintext one-time code.
   - Completed and expired challenges are retained only as long as the planned cleanup policy requires.
4. A pre-auth rate-limit store keyed by a server-derived identifier, because a user ID does not yet exist when a code is requested.

User-owned meal, profile, plan, coach, vision, feedback, milestone, and quota records continue to reference `app_users.id`; no platform column is added to each business table. The admin user query joins or selects `app_users.client_platform` to filter and display source.

## HTTP contract

All routes are hosted by the existing `get-login-ticket` HTTP function.

### `POST /mobile-auth/google`

Input: an Android-obtained Google ID token.

Server behavior:

1. Validate the request shape and apply IP/request limits.
2. Verify the token against Google's current signing keys and validate issuer, audience, expiry and stable `sub` claim.
3. Find or create an `android_app` user through the hashed Google identity.
4. Return the existing signed product session.

### `POST /mobile-auth/challenge`

Input: `channel` (`email` or `phone`) and an email address or E.164 phone number.

Server behavior:

1. Normalize and validate the destination.
2. Apply destination and IP rate limits before generating a code.
3. Generate a cryptographically secure, short-lived code; store only its keyed hash.
4. Send the code through Brevo for email or httpSMS for phone.
5. Return a generic success response that does not reveal whether an account exists.

### `POST /mobile-auth/verify`

Input: `channel`, destination and code.

Server behavior:

1. Find a live, unused challenge and compare its keyed code hash in constant time.
2. Enforce the failed-attempt cap and consume the challenge atomically on success.
3. Find or create an `android_app` user through the hashed email or phone identity.
4. Return the existing signed product session.

## Vendor boundaries

CloudBase continues to run the HTTP function, PostgreSQL, product session, business APIs, Storage, AI and observability. It does not become the Android identity provider.

| Vendor | Server-only configuration | Readiness evidence needed before DEV integration |
| --- | --- | --- |
| Google | `GOOGLE_OAUTH_SERVER_CLIENT_ID` | Android OAuth client configured for the final package name and signing certificates; a real ID token verifies in DEV. |
| Brevo | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | API key, sender/domain readiness, and one delivered test email. |
| httpSMS | `HTTPSMS_API_KEY`, `HTTPSMS_FROM_E164` | API key, a dedicated online Android gateway phone with a valid SIM, and one delivered test SMS. |
| Local auth | `AUTH_CODE_HMAC_SECRET` | A distinct, non-empty secret stored in the CloudBase function environment. |

Provider API keys and sender identifiers are not requested until code has the configuration boundary and DEV readiness tests are prepared. They must be added directly to the named CloudBase DEV function environment, never committed, pasted into the client, or placed in public build configuration.

## Android client boundary

The Android login page offers Google, email, and phone choices. It calls a platform-specific authentication adapter and then hands the common product-session result to the existing auth store.

The Mini Program path remains isolated behind its current `Taro.login()` adapter. Android session persistence replaces the current direct `wx` storage dependency with an explicit Android/H5-compatible storage adapter. Regular product API routes keep their existing JSON and Bearer contracts.

## Abuse and error handling

- Code lifetime: 5 minutes.
- Verification attempts: at most 5 per code.
- Resend cooldown: at least 60 seconds per destination/channel.
- Error responses remain generic for unknown, existing, and disabled accounts.
- Provider timeouts, rejected requests and delivery failures are logged without raw email, phone, code, token, API key, or request body.
- Google token failure does not create a user.
- Brevo/httpSMS send failure does not persist a usable challenge.

## Acceptance criteria

1. Existing Mini Program WeChat login behavior and tests remain unchanged.
2. Android Google, email, and phone flows each issue the same product session shape after successful authentication.
3. Android-created users have `client_platform = android_app`; existing users remain `wechat_mini_program`.
4. Existing authenticated product APIs accept Android sessions without changing their request or response contracts.
5. The admin user list can display and filter by client platform.
6. No third-party secret, one-time code, raw destination, or raw Google token is stored in Git, client storage, response payloads, or logs.
7. Unit tests cover identity normalization/hashing, code expiry/consumption, rate limiting, provider failure handling, token validation seams, and unchanged Mini Program authentication.
8. DEV integration tests prove one real delivery for Brevo and one for httpSMS only after the user provides the required credentials and test destinations.

## Explicit non-goals

- Merging Android and WeChat accounts or migrating Mini Program history.
- Google Play publishing, Android packaging, camera/media adaptation, streaming adaptation, payments, push notifications, or production deployment.
- Replacing the current product session with CloudBase App Auth.
