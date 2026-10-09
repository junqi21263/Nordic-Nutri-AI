# Nordic Nutri AI Android Authentication / Account System

## 1. Scope and audit conclusion

This document supersedes the earlier simplified Android authentication proposal. It covers the Android app authentication/account system only. The existing WeChat Mini Program remains running on its current path during this work; no Mini Program login migration or production change is included.

Current repository evidence:

- Frontend: Taro 4.2.0 + React 18.3.1 + TypeScript, currently configured for WeChat Mini Program and H5. No Android native project or Capacitor bridge exists yet.
- Current client auth: `Taro.login()` -> existing HTTPS function -> WeChat OpenID hash -> product user -> a seven-day signed access token. Session persistence still depends on `globalThis.wx` in `src/auth/session-manager.ts`.
- Current backend: CloudBase HTTPS Function `get-login-ticket` owns the HTTP boundary, PostgreSQL access, product APIs, Storage and AI adapters. Existing product requests use `Authorization: Bearer <token>`.
- Current data model: most product tables reference `public.app_users(id)`. Existing `openid_hash` is server-side and raw OpenID is not stored.
- Current verification: root initialization checks pass. The worktree has no installed mini-program dependencies, and the current runtime is Node 25.9.0 although the repository requires Node `>=24.18.0 <25`; H5/typecheck/device claims are therefore not verified.

Conclusion: most product APIs, business tables, CloudBase Function boundary and server-only PostgreSQL access are reusable. Authentication, identity lookup, CAPTCHA/OTP workflows, token lifecycle, frontend storage and the Android native Google bridge are not reusable as-is and must be redesigned.

## 2. Decisions

### Authentication methods

The Android app supports:

1. Google native authorization using Android Credential Manager. The Android layer obtains an ID token; the server validates issuer, audience, signature, expiry and stable Google `sub` before creating a session.
2. Email + password login.
3. Phone + password login, with one canonical E.164 representation.

Email codes and SMS OTP are never used for routine login. They are used only for registration, password recovery, changing/binding an email or phone, and other explicitly sensitive operations.

### Backend placement

Keep CloudBase as the backend platform and keep the existing `get-login-ticket` HTTPS Function as the first implementation boundary. Add an `/auth/*` route family and a separate auth service module inside the function. Do not expose CloudBase database credentials, provider keys, Google server credentials or session-signing secrets to the app.

Do not use CloudBase App Auth as the Android product identity provider for this design. The function remains the product authentication authority while CloudBase continues to host the data/API layer.

### User model and platform separation

Retain `public.app_users.id` as the product user ID so all meal, profile, plan, coach, vision, feedback, milestone and quota tables remain compatible. Extend the account model rather than renaming every foreign key.

- `app_users.client_platform`: server-controlled `wechat_mini_program` or `android_app`.
- `app_users.email`, `email_normalized`, `email_verified_at`, `phone_e164`, `phone_verified_at`, `password_hash`, `password_changed_at` and account status fields are managed only by the auth service.
- Add `user_identities` for Google identities. A Google identity is unique by `(provider, provider_user_id_hash)` and points to one product user.
- Never auto-merge a Google identity with an existing email account solely because the email strings match. Add an explicit authenticated linking flow later if needed.
- Existing WeChat users remain identifiable through `openid_hash` and are not silently converted into Android accounts. If a future account-linking feature is approved, it must be a separate verified flow.
- Admin user listing/detail APIs must select and filter `client_platform`; business rows do not need a duplicated platform column.

### Session model

Replace the current seven-day-only product token for Android with:

- short-lived access token, approximately 15 minutes, containing only non-sensitive claims such as user ID, session ID and expiry;
- long-lived rotating refresh token, stored server-side only as a keyed hash;
- `auth_sessions` row with device hash, refresh-token hash, expiry, revoked/replaced timestamps and last-used timestamp;
- refresh-token rotation with replay detection; reuse revokes the affected session family;
- single-session logout and logout-all;
- password reset, account deletion and security-sensitive changes revoke existing sessions by default.

The Mini Program authentication path is kept isolated while the new verifier is introduced. Existing product routes must accept the new Android access token through the same Bearer authorization boundary. A compatibility decision for legacy WeChat tokens will be made during implementation after all active clients are inventoried; no client-side migration is assumed.

## 3. API contract

All routes are under the existing HTTPS Function. Public error bodies use stable machine codes and generic user-facing messages. Login, registration and reset responses must not reveal whether an email, phone or Google identity exists.

### CAPTCHA

- `POST /auth/captcha`
- Response: `{ captchaId, image, expiresIn }`
- Server-only `CaptchaProvider` interface: `createChallenge()` and `verifyChallenge()`.
- Provider implementations: `MockCaptchaProvider` for explicit test environments and an external adapter selected by `CAPTCHA_PROVIDER`; no provider is hard-coded in route logic.
- CAPTCHA records store a challenge ID, answer hash, expiry, attempt count and request/device hashes; no plaintext answer.
- TTL 3–5 minutes, maximum five attempts. Return `AUTH_CAPTCHA_INVALID` or `AUTH_CAPTCHA_EXPIRED`.
- The client renders the returned image and never creates or verifies the challenge.

### Password login

- `POST /auth/login/email`: email, password, captchaId, captchaAnswer, device metadata.
- `POST /auth/login/phone`: country/phone normalized to E.164, password, captchaId, captchaAnswer, device metadata.
- No OTP is sent or accepted on these routes.
- All unknown, wrong-password, disabled and unverified-account cases use `AUTH_INVALID_CREDENTIALS` with a generic message.
- Successful response includes `{ user, session: { accessToken, refreshToken, expiresIn }, onboardingRequired }`.

### Email registration

- `POST /auth/register/email/send-code`: normalized email, captcha proof, and a registration flow ID.
- `POST /auth/register/email/verify`: flow ID, email, six-digit code, password, password confirmation if the client has not already validated it.
- Code TTL 10 minutes; resend cooldown 60 seconds; max five sends/hour and ten/day per normalized destination, plus IP/device limits.
- A new code invalidates the previous live code. Final verification and user creation are atomic and protected by a unique normalized-email constraint.
- Provider failure must not leave a usable challenge marked as sent.

### Phone registration

- `POST /auth/register/phone/send-code`: E.164 phone, captcha proof, registration flow ID.
- `POST /auth/register/phone/verify`: flow ID, E.164 phone, six-digit SMS OTP, password.
- Same code lifetime, resend and attempt rules as email, with phone-specific anti-abuse limits.
- Store and compare one canonical E.164 form; do not support multiple equivalent formats in persistence.

### Password recovery and account security

- `POST /auth/password/forgot/email` and `/auth/password/forgot/phone`: captcha plus destination; always generic success.
- `POST /auth/password/reset`: verified flow, OTP, new password; consume the code atomically and revoke existing sessions by default.
- Later sensitive flows use the same provider abstractions for change/bind email or phone. They are not part of the first login-page slice unless separately approved.

### Sessions and Google

- `POST /auth/session/refresh`: rotate refresh token and return a new access/refresh pair.
- `POST /auth/session/logout`: revoke current session.
- `POST /auth/session/logout-all`: revoke all sessions for the authenticated user.
- `POST /auth/google`: Android ID token plus device metadata. The backend verifies the token and performs find-or-create by Google identity only.

## 4. Database design

Use forward-only migrations in the existing CloudBase PostgreSQL migration directory. The exact migration must be reviewed against the live DEV schema before applying.

Recommended additions/changes:

1. Extend `public.app_users` with normalized email/phone, verification timestamps, password hash metadata, `client_platform`, `password_changed_at` and any needed account security version. Keep `openid_hash` for the running WeChat path.
2. Create `private.user_identities` or `public.user_identities` according to the existing server-only exposure convention. Fields: `user_id`, `provider`, keyed `provider_user_id_hash`, optional provider email metadata, created/updated timestamps, unique provider/hash pair.
3. Create `private.auth_verification_codes`: target type/hash, purpose, channel, code hash, expiry, attempts, max attempts, consumed timestamp, created timestamp, IP/device hashes and flow ID. Do not store plaintext OTP, unnecessary raw destinations or captcha answers.
4. Create `private.auth_captchas`: challenge ID, answer hash, expiry, attempts, request/device hashes and consumed/invalidated timestamps.
5. Create `private.auth_sessions`: user ID, session family ID, refresh hash, device hash, created/last-used/expiry/revoked/replaced timestamps and revoke reason. Add indexes for active sessions and refresh lookup.
6. Reuse existing private rate-limit/operation-guard patterns where their semantics fit, but add pre-auth keys for destination/IP/device because a user ID does not exist before registration.
7. Add atomic SQL functions or transaction-backed server operations for: consume CAPTCHA attempt, issue/invalidate OTP, consume OTP, create account, rotate refresh token, revoke session family and revoke all user sessions.

All unique constraints and final checks must be server/database enforced. Client-supplied `client_platform`, user ID, verification status, admin status and account status are ignored.

## 5. Provider boundaries

### Email: Brevo

Implement `EmailProvider.sendVerificationCode({ to, code, purpose, requestId })`. The key remains in the CloudBase Function environment. The adapter calls Brevo's transactional email API and logs only provider status/request ID and sanitized error classification.

Required readiness before real DEV delivery: API key, verified sender/domain, sender name/address, approved template or subject/body, and one test destination. No real provider call is made during this audit.

### SMS: httpSMS

Implement `SmsProvider.sendVerificationCode({ to, code, purpose, requestId })`. The httpSMS adapter is server-only and uses its API key. It requires a dedicated Android gateway phone with the httpSMS app online and a valid SIM. This is a material operational dependency: it is suitable for the first controlled DEV path only after delivery reliability, availability and cost/abuse behavior are validated; the interface must allow replacement later.

Required readiness before real DEV delivery: API key, gateway phone, sender/from value, test number and one delivered SMS. The mock provider is allowed only when the environment explicitly identifies itself as test/development; production startup must fail if SMS provider is mock.

### Google native Android

Use Android Credential Manager in the native bridge. The client sends only the resulting ID token to the backend over HTTPS. The server must validate Google signing keys and claims; it must not trust an email or user ID supplied by the client. Android package name, OAuth client IDs and signing certificate fingerprints are environment-specific configuration, not source-controlled secrets.

## 6. Frontend design

The current Mini Program auth page remains unchanged during this slice. Android gets a platform-specific auth entry that shares primitives and API types:

- `AuthInput`
- `PasswordInput`
- `CaptchaField`
- `OtpInput`
- `AuthError`
- `AuthButton`
- `CountryPicker`

The initial screen follows the supplied flow: Google button, Email/Phone switch, password login, image CAPTCHA, forgot password, and Create account. Registration branches into email or phone, CAPTCHA, OTP, then password creation.

Extract an explicit `SessionStorage` adapter. Android must use secure native storage for refresh tokens where the chosen Android shell supports it; do not use `globalThis.wx` or ordinary web storage for long-lived refresh tokens. Access token memory lifetime and refresh-on-401 behavior must be defined centrally in the auth client.

The product API client continues to send Bearer access tokens and must retry one refresh only on an authenticated 401. Concurrent refresh calls are single-flight; refresh replay or failure clears local auth state and returns the user to the auth entry.

## 7. Security, privacy and abuse controls

- Password length 8–128 characters, password managers allowed; use Argon2id if the runtime supports it, otherwise the approved framework password hash. Never MD5, SHA-1, plain SHA or plaintext.
- OTPs use a CSPRNG, six digits, keyed hash at rest, max five verification attempts and one-time atomic consumption. Fixed mock codes are accepted only in an explicit test environment.
- Email: one send/60 seconds, five/hour, ten/day per normalized destination; add IP/device limits.
- SMS: one send/60 seconds, three/hour, eight/day per destination; ten/hour per IP and device; CAPTCHA is not the only defense.
- Login uses progressive backoff and credential-stuffing protection without a permanent lockout as the default.
- Perform the final rate-limit and account-state check atomically immediately before provider invocation; provider errors do not count as successful sends.
- Use generic responses to prevent account enumeration. Avoid different timing or response structure for existing/non-existing accounts.
- Never log passwords, OTPs, CAPTCHA answers, access/refresh tokens, raw provider responses containing secrets, API keys, raw Google ID tokens, full emails or phone numbers. Use masked destinations plus request/trace IDs.
- Review CSRF if an H5 surface is used, XSS, SQL injection, mass assignment, session fixation, refresh replay, race conditions, SMS pumping, email bombing, captcha replay, authorization isolation and account deletion behavior.

## 8. Implementation sequence after approval

### Phase 1 — baseline and audit

Switch validation to Node 24.18.x, install dependencies in the isolated worktree, run existing unit/typecheck/build checks, inventory active routes and clients, and record DEV-only baselines. No provider calls or remote writes.

### Phase 2 — auth domain and schema

Add pure normalization/hash/error modules and reviewed PostgreSQL migration. Add database-level constraints and atomic operations. Unit-test them before route wiring.

### Phase 3 — provider adapters

Add provider interfaces plus mock implementations. Add Brevo and httpSMS adapters behind environment selection. Add startup guards and redacted diagnostics. Keep real credentials unset until explicit DEV approval.

### Phase 4 — session service

Implement password hashing, account creation, login, access/refresh issuance, rotation, replay detection, logout and revoke-all. Add Google token verification seam and server-side identity mapping.

### Phase 5 — HTTP routes

Add `/auth/captcha`, registration, login, password reset, Google and session routes. Keep public errors stable and generic. Add route-level size/time/rate guards.

### Phase 6 — existing product authorization

Adapt the shared Bearer verifier and auth context to accept the new Android access token while preserving the running WeChat path until compatibility is proven. Ensure deleted/suspended users and revoked sessions cannot access product APIs.

### Phase 7 — Android client/auth UI

Add the platform auth adapter, secure storage, single-flight refresh, auth state transitions and the supplied login/registration screens. Keep UI primitives shared and remove duplicated form logic.

### Phase 8 — native and product transport adapters

Add the Android shell/bridge for Google Credential Manager, persistent storage, camera/file transport and Coach streaming only as separate adapters. Reuse product API contracts; do not mix platform checks throughout business screens.

### Phase 9 — verification and release gates

Run unit/security/contract tests, authenticated A/B isolation tests, DEV database readback, one approved Brevo delivery, one approved httpSMS delivery, real Google verification, Android device tests, offline/rotation/replay tests and release artifact checks. Production deployment, provider activation and store submission remain separate explicit approvals.

## 9. Acceptance criteria

The first auth slice is accepted only when:

- Email and phone password login work without sending OTP and require CAPTCHA.
- Email and phone registration require CAPTCHA plus the correct OTP, with atomic one-time consumption.
- Forgot password is generic, OTP-protected and revokes existing sessions.
- Google native tokens are verified server-side and map only through the Google identity table.
- Android-created accounts are marked `android_app`; WeChat accounts remain distinguishable.
- Existing authenticated product endpoints continue to work with the new Android access token without client-side DB/API-key access.
- Single logout, logout-all, refresh rotation and refresh replay handling are tested.
- No credential, token, OTP, CAPTCHA answer, provider key or unnecessary raw destination appears in source, client storage, response payload or logs.
- DEV provider and real-device evidence are explicitly recorded; anything not run is marked `NOT VERIFIED`.

## 10. Explicit blockers and approvals needed later

- Node 24.18.x is required before reliable local build/typecheck evidence.
- The current worktree has not installed `mini-program/node_modules`; dependency installation is still pending.
- No Brevo, httpSMS or Google server/native credentials are configured for this worktree, and no real delivery has been attempted.
- httpSMS requires a continuously available gateway phone; production suitability is not yet verified.
- The exact live DEV PostgreSQL schema and active CloudBase Function environment must be re-read before any migration or deployment.
- No CloudBase remote mutation, migration, provider secret, paid SMS/email call, production deployment or store submission is authorized by this audit.
