# Simplified Android Auth V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after explicit approval. Do not apply migrations or deploy providers while this plan is under review.

**Goal:** Add a simple Android authentication system with Google, email/password and phone/password while preserving the running WeChat Mini Program path and existing product APIs.

**Architecture:** Keep CloudBase HTTPS Function `get-login-ticket` as the only backend boundary and keep `public.app_users.id` as the product user ID. Add only the account columns and one `auth_verification_codes` table, issue the existing style of signed Bearer token with `sub`, `ver` and `exp`, and let `token_version` invalidate old tokens after password changes. Android-specific HTTP calls and secure token storage stay behind small client modules; the WeChat login code remains untouched.

**Tech Stack:** Taro 4.2.0, React 18.3.1, TypeScript, CloudBase HTTPS Function on Node.js, CloudBase PostgreSQL, HMAC-signed token, Argon2id password hashing, Google Credential Manager, Brevo email, httpSMS SMS, one selected external CAPTCHA API.

---

## 1. File structure

Use the current repository conventions. The backend is CommonJS today, so provider files use `.cjs`; do not introduce a TypeScript server build only for this feature.

### Backend files

- Create `cloudbase/functions/get-login-ticket/services/auth.cjs`
  - Normalize email/phone, validate password, generate/hash OTP, hash/verify passwords, create/login users, issue/verify tokens, bump `token_version`, and perform Google account lookup.
  - Keep database writes in this service or its existing database client pattern; do not create a generic repository framework.
- Create `cloudbase/functions/get-login-ticket/services/captcha.cjs`
  - Export only `getCaptcha()` and `verifyCaptcha()`.
  - Call the one configured third-party CAPTCHA API; pass its challenge ID back to the client and do not create a local CAPTCHA table.
- Create `cloudbase/functions/get-login-ticket/services/email.cjs`
  - Export `sendVerificationCode(email, code)` and call the existing Brevo email provider configuration.
- Create `cloudbase/functions/get-login-ticket/services/sms.cjs`
  - Export `sendVerificationCode(phone, code)` and call httpSMS. If the provider changes before implementation, replace this one file; do not add a provider registry or adapter collection.
- Modify `cloudbase/functions/get-login-ticket/index.js`
  - Read auth provider configuration, wire the four services, add the `/auth/*` routes, and connect the shared Bearer verifier to `token_version`.
  - Leave the existing WeChat code-exchange route and Mini Program behavior unchanged.
- Modify `cloudbase/functions/get-login-ticket/product-session-service.cjs`
  - Preserve its public module shape where existing tests depend on it.
  - Add the V1 token payload fields `sub`, `ver`, `iat`, `exp` and verification of the user’s current `token_version`.
- Modify `cloudbase/functions/get-login-ticket/product-session-auth.cjs`
  - Resolve the token subject to an active `app_users` row and reject a mismatched token version or non-active account.
- Create `cloudbase/functions/get-login-ticket/auth.test.mjs`
  - Cover pure auth rules, token rules and provider seams without real network calls.
- Create `cloudbase/functions/get-login-ticket/auth-routes.test.mjs`
  - Cover route contracts, stable error codes, generic login failures and provider failure behavior.

### Database files

- Create `cloudbase/pg/migrations/0059_simplified_android_auth_v1.sql` after confirming that no newer numbered migration exists.
  - Add only the requested `app_users` columns, indexes/constraints, and `auth_verification_codes`.
  - Do not execute the migration in this phase.
- Create `cloudbase/pg/migrations/0059_simplified_android_auth_v1.test.mjs` if the existing migration test convention requires a static schema assertion.

### Client files

- Create `mini-program/src/api/android-auth-api.ts`
  - Implement the Android `/auth/*` HTTP calls and map server errors to stable auth error codes.
  - Do not modify the existing WeChat request function.
- Modify `mini-program/src/auth/session-manager.ts`
  - Replace the direct `globalThis.wx` dependency with the existing session-storage seam.
  - Keep the Mini Program storage implementation available; add the Android secure-storage implementation at the platform boundary.
- Modify `mini-program/src/auth/auth-store.ts`
  - Store the common user/session shape and support access-token replacement after a successful login.
- Create `mini-program/src/pages/android-auth/index.tsx`
  - Hold only V1 auth modes: login, register email, register phone, forgot password.
  - Render the common Google, email, phone, password, CAPTCHA and OTP controls without duplicating form logic.
- Create `mini-program/src/pages/android-auth/index.config.ts`
  - Register the Android auth page without changing the existing WeChat auth-entry page.
- Create `mini-program/src/platform/google-credential-manager.ts`
  - Expose one function: `getGoogleIdToken(): Promise<string>`.
  - The Android shell implements the native call; tests use a deterministic fake token.
- Create `mini-program/src/platform/secure-token-storage.ts`
  - Expose `getToken`, `setToken`, and `clearToken`.
  - Android production implementation must use native secure storage; ordinary `AsyncStorage` is not acceptable for the token.
- Create `mini-program/src/pages/android-auth/index.test.tsx`
  - Test mode transitions and that login never requests OTP.

### Configuration and documentation files

- Modify `.env.example`
  - Document names only, with empty values for `AUTH_OTP_HMAC_SECRET`, Google server client ID, Brevo sender/API configuration, SMS configuration and CAPTCHA configuration.
- Modify `README.md`
  - Document the Android auth boundary, Node 24.18.x requirement and the fact that provider secrets belong only to the CloudBase Function.
- Do not add credentials to `.env.production`, source files, client build constants or Git history.

## 2. Database changes

The migration must preserve all existing columns needed by the running Mini Program, including `cloudbase_uid` and `openid_hash`. Add these V1 fields to `public.app_users`:

```sql
email text;
email_normalized text;
email_verified_at timestamptz;
phone_e164 text;
phone_verified_at timestamptz;
password_hash text;
google_sub text;
created_platform text not null default 'wechat_mini_program';
token_version integer not null default 1;
```

Use constraints and partial unique indexes:

```sql
check (created_platform in ('wechat_mini_program', 'android_app'));
check (token_version >= 1);
create unique index app_users_email_normalized_uidx on public.app_users (email_normalized) where email_normalized is not null;
create unique index app_users_phone_e164_uidx on public.app_users (phone_e164) where phone_e164 is not null;
create unique index app_users_google_sub_uidx on public.app_users (google_sub) where google_sub is not null;
```

The migration must use the repository’s existing update timestamp trigger convention. Existing rows are backfilled as `wechat_mini_program`; the server, not the client, writes `android_app` for newly created Android users.

Create one server-owned table, preferably `private.auth_verification_codes` to match the existing private auth/rate-limit convention:

```sql
id uuid primary key default gen_random_uuid(),
target text not null,
target_type text not null check (target_type in ('email', 'phone')),
purpose text not null check (purpose in ('register', 'forgot_password')),
code_hash char(64) not null,
expires_at timestamptz not null,
attempt_count integer not null default 0,
used_at timestamptz,
created_at timestamptz not null default now()
```

`target` is the server HMAC of normalized email or E.164 phone, not the raw destination. Add an index that finds the latest live record by target, type and purpose. On a new code, invalidate previous unused records for the same target/type/purpose before inserting the new row. Final verification must atomically check expiry, attempt count and `used_at`, increment failed attempts on wrong code, and set `used_at` on success.

Do not add `user_identities`, registration flow state, CAPTCHA table, session table, device table, session family or account-linking tables in V1.

## 3. API contract

All routes are served by the existing Function endpoint. Every request is JSON over HTTPS. Use the current response envelope and stable `code` values.

### CAPTCHA

- `POST /auth/captcha`
  - Request: `{}` or the provider-required public parameters.
  - Response: `{ captchaId, image, expiresIn }`.
  - The client submits `captchaId` and `captchaAnswer` to send-code/login routes.
  - The server calls `verifyCaptcha(captchaId, captchaAnswer)` before any email/SMS send or password login.

### Registration

- `POST /auth/register/email/send-code`
  - Request: `{ email, captchaId, captchaAnswer }`.
  - Normalize email, verify CAPTCHA, enforce five sends/hour per normalized email, generate six digits with a CSPRNG, store only HMAC hash, then call `sendVerificationCode`.
  - Response is generic: `{ sent: true, expiresIn: 600, resendAfter: 60 }`.
- `POST /auth/register/email`
  - Request: `{ email, code, password }`.
  - Verify the newest live code, validate password, atomically create an `android_app` user with `email_verified_at`, hash the password with Argon2id, and return the standard user/session response.
- `POST /auth/register/phone/send-code`
  - Request: `{ phone, captchaId, captchaAnswer }`.
  - Normalize to E.164, verify CAPTCHA, enforce three sends/hour per phone, generate/store/send a six-digit OTP.
- `POST /auth/register/phone`
  - Request: `{ phone, code, password }`.
  - Verify the newest live code, atomically create an `android_app` user with `phone_verified_at`, hash the password and return the standard user/session response.

### Login

- `POST /auth/login/email`: `{ email, password, captchaId, captchaAnswer }`.
- `POST /auth/login/phone`: `{ phone, password, captchaId, captchaAnswer }`.
- `POST /auth/login/google`: `{ idToken }`.

Email/phone login always verifies CAPTCHA and password. It never sends or accepts OTP. Unknown account, wrong password, disabled account and invalid credentials return `AUTH_INVALID_CREDENTIALS`.

Google login validates signature, issuer, audience, expiry and `sub`, then finds `google_sub`. If no user exists, create an Android user. If the verified Google email matches an existing email-password account but `google_sub` is not already attached, return `AUTH_EMAIL_ALREADY_REGISTERED`; do not merge.

Successful auth returns:

```json
{
  "user": { "id": "UUID from the newly authenticated app_users row" },
  "session": { "accessToken": "<signed-token>", "expiresIn": 604800 },
  "onboardingRequired": true
}
```

### Password recovery and account session

- `POST /auth/password/forgot/email`: `{ email, captchaId, captchaAnswer }`.
- `POST /auth/password/forgot/phone`: `{ phone, captchaId, captchaAnswer }`.
- Both return the same generic response whether the account exists. Send code only after CAPTCHA and rate-limit checks.
- `POST /auth/password/reset`: `{ target, targetType, code, password }`.
  - Atomically consume the code, replace `password_hash`, increment `token_version`, and return generic success. Do not return whether the target was previously registered.
- `GET /auth/me`: authenticate Bearer token, load the active user and return the safe account/user shape.
- Logout V1 clears Android secure storage and the in-memory auth store; no backend logout endpoint or server-side session table is added.

### Token

Sign the existing compact HMAC payload with `APP_SESSION_SECRET`:

```json
{ "sub": "UUID from the authenticated app_users row", "ver": 1, "exp": 0, "iat": 0 }
```

Here `ver` is the user’s current `token_version`, not a token schema version. The verifier checks signature, expiry, active user and `token_version` equality on every authenticated request. The token lifetime is seven days. No refresh token is issued in V1.

## 4. Pages and client flow

Keep `mini-program/src/pages/auth-entry/index.tsx` on the existing WeChat flow. The Android shell opens `android-auth/index`.

The Android page has four local modes:

1. Login: Google button, Email/Phone tabs, identifier, password, image CAPTCHA, Sign In.
2. Register Email: email, image CAPTCHA, send email code, six-digit code, password, Create account.
3. Register Phone: country picker, phone, image CAPTCHA, send SMS code, six-digit code, password, Create account.
4. Forgot Password: email/phone choice, image CAPTCHA, send code, OTP, new password, reset.

Use shared small controls already compatible with Taro. Do not build separate duplicated forms for email and phone; only the identifier and send-code API differ. Show generic error messages while retaining the machine code for diagnostics.

After successful auth, store the one access token in secure Android storage, update the existing auth store, and reuse the existing product API client’s Bearer header. On 401, clear the token and route to Android auth; do not implement refresh logic.

## 5. Auth flow

### Email/phone registration

```text
identifier -> CAPTCHA -> send-code rate limit -> generate 6 digits
-> HMAC-store code -> provider send
-> verify newest code atomically -> Argon2id password hash
-> INSERT app_users(created_platform=android_app) -> issue 7-day token
```

If the provider call fails, do not report a successful send and do not leave a usable verification row. If the final insert loses a uniqueness race, return the stable registration conflict code without exposing another account.

### Password login

```text
identifier -> CAPTCHA -> normalize -> find app_users
-> verify Argon2id password -> check active status
-> issue token(sub, ver, exp)
```

All failure branches return `AUTH_INVALID_CREDENTIALS` to the client.

### Google login

```text
Credential Manager -> ID token -> HTTPS Function
-> verify Google claims -> find google_sub
-> create Android user or login existing Google user
-> issue token
```

The backend trusts no user ID/email supplied outside the verified Google token.

### Forgot password

```text
identifier -> CAPTCHA -> generic send response
-> OTP verify atomically -> replace password_hash
-> token_version += 1 -> old tokens fail verification
```

## 6. Security minimum

- Password length 8–128 characters; use a maintained Argon2id library. No custom password algorithm and no MD5/SHA-1/plain SHA/plaintext.
- OTP is six digits from a CSPRNG, valid for 10 minutes, one-time use, maximum five verification attempts and 60-second resend cooldown.
- Rate limits: SMS three/hour per E.164 phone; email five/hour per normalized email. Enforce CAPTCHA before send-code and login.
- Store only HMAC hashes for OTP and verification targets. Never log passwords, OTPs, CAPTCHA answers, tokens, API keys, raw Google ID tokens or provider secrets.
- Keep provider keys in CloudBase Function environment variables only. Do not put them in Taro `defineConstants`, `.env.production`, APK resources or client requests.
- Use HTTPS, request body size limits and the current request/trace ID sanitization. Mask email/phone values in server logs.
- Verify Google signature, issuer, audience, expiry and `sub` server-side. Never trust the client’s Google email as identity proof.
- Sign tokens with the existing HMAC secret and check `token_version` on each request. Password reset increments the version.
- Make registration uniqueness and OTP consumption database-atomic. Do not use a check-then-insert sequence without a unique constraint.
- Return `AUTH_INVALID_CREDENTIALS` for all email/phone login failures. Do not distinguish “account missing” from “password wrong”.
- Production startup must reject empty session/OTP secrets and reject mock SMS/CAPTCHA modes if those modes are enabled.
- V1 explicitly does not include refresh rotation, session families, device management, account linking, risk scoring or Redis.

## 7. Test list

### Backend unit tests

- Email trim/lowercase normalization and invalid email rejection.
- Phone normalization to one E.164 value and invalid country/phone rejection.
- Password boundaries: 7 fails, 8 passes, 128 passes, 129 fails.
- Argon2id hash verification and rejection of wrong password.
- OTP generation is six digits; stored value is an HMAC digest, not the code.
- OTP expiry, five-attempt limit, wrong-attempt increment, successful `used_at`, replay rejection and previous-code invalidation.
- Email/SMS resend cooldown and hourly limits.
- CAPTCHA verification occurs before provider call; CAPTCHA failure makes no send call.
- Provider failure does not return success or leave an active usable code.
- Email/phone registration uniqueness race returns a stable conflict.
- Token signature, expiry, `sub`, `ver` and user `token_version` mismatch.
- Password reset increments `token_version` and invalidates an old token.
- Google issuer/audience/signature/expiry/sub validation and same-email conflict without auto-merge.
- Generic login error mapping and redacted logging.

### Backend route tests

- Every listed `/auth/*` route accepts the documented JSON shape.
- Normal login never invokes email or SMS provider.
- Registration and forgot-password routes invoke the provider only after CAPTCHA/rate checks.
- `GET /auth/me` rejects missing, malformed, expired, signed-with-wrong-secret and version-mismatched tokens.
- Android-created rows use `created_platform=android_app`; WeChat route behavior remains covered by existing tests.

### Client tests

- Login page switches Email/Phone without losing unrelated state.
- Login submission requires identifier, password and CAPTCHA; it does not show/send OTP.
- Registration branches require CAPTCHA before code request and OTP before create.
- Generic error messages map from stable server codes.
- Successful login stores the token through secure-storage seam only.
- 401 clears local token and auth state.
- No `AsyncStorage` import or direct `globalThis.wx` dependency exists in the Android auth path.

### Later DEV/device tests, not executed now

- One approved Brevo delivery, one approved SMS delivery and one real Google Credential Manager login.
- Android device restart with secure token restoration.
- Password reset invalidates a previously issued token.
- Two concurrent registration attempts for the same email/phone.
- Existing WeChat login and authenticated product API regression.

## 8. Development order

### Task 1 — Runtime baseline only

- Use `/opt/homebrew/opt/node@24/bin` at the front of `PATH` for this project.
- Confirm `node --version` is `v24.18.0` and `pnpm --version` is `10.33.0`.
- Run `pnpm run check`.
- Install dependencies only if needed for local tests; do not contact providers or CloudBase.

### Task 2 — Confirm provider contracts before code

- Record the exact CAPTCHA vendor/API response shape and httpSMS configuration names.
- Confirm Brevo sender configuration and httpSMS gateway readiness later; do not add secrets now.
- If the CAPTCHA vendor is not selected, implementation stops at the service boundary until its API contract is supplied.

### Task 3 — Write auth tests and migration, but do not apply migration

- Add the failing unit/route tests for normalization, OTP, password, token versioning and Google claim validation.
- Add the next numbered SQL migration with only `app_users` extensions and `private.auth_verification_codes`.
- Review the migration against the live DEV schema only when explicit remote-read approval is given.

### Task 4 — Implement the minimum backend services

- Implement `services/captcha.cjs`, `services/email.cjs`, `services/sms.cjs` with one concrete configured provider each and test doubles only in tests.
- Implement `services/auth.cjs` with the exact flows in this plan.
- Wire configuration and route handling in `index.js`.
- Run backend unit and route tests locally with provider/network mocks.

### Task 5 — Connect Bearer authorization

- Update token issuance and verification to include `sub`, current `token_version` and seven-day `exp`.
- Make `GET /auth/me` and existing product routes use the same active-user/version checks.
- Run existing product-session and API tests; do not change the WeChat code exchange.

### Task 6 — Add Android client auth page and storage seam

- Add `android-auth-api.ts`, Android auth page/config, Google Credential Manager boundary and secure-token-storage boundary.
- Keep the WeChat auth entry separate.
- Run client unit/component tests and static checks under Node 24.18.0.

### Task 7 — Local verification and review gate

- Run `pnpm --dir mini-program typecheck`, lint, unit tests and backend tests.
- Review diff for unnecessary tables, abstractions, provider secrets, OTP/token logging and accidental Mini Program changes.
- Stop and report any `NOT VERIFIED` build/device/provider gaps; do not claim Android runtime acceptance from static tests.

### Task 8 — Explicitly approved DEV integration, later

- Only after code review and explicit approval: apply the named DEV migration, configure server-only secrets, test one delivery per provider, run authenticated API regression and test on a real Android device.
- Production migration, production provider activation, APK release and Google Play submission are separate approvals and are not part of V1 implementation.
