# Android Session Refresh and In-App Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Android users signed in with rotating 30-day refresh tokens and let eligible old APKs upgrade through an app market or a verified CloudBase-hosted APK after Home opens.

**Architecture:** Extend the existing `get-login-ticket` auth service and encrypted Android session store instead of adding a second auth stack. Add one server-only PostgreSQL migration for refresh sessions and Android release metadata, one public version endpoint, and one small native bridge for version/market/download/install operations; the Taro layer owns retry coordination and the Nordic update dialog.

**Tech Stack:** Node.js CloudBase HTTP function, CloudBase PostgreSQL, Taro 4/React/TypeScript/Zustand, Capacitor Android/Java, Vitest, Node test runner, Gradle.

---

## File map

- Create `cloudbase/pg/migrations/0068_android_refresh_sessions_and_releases.sql`: server-only refresh-session and Android-release schema plus atomic token rotation RPC.
- Create `cloudbase/pg/migrations/0068_android_refresh_sessions_and_releases.test.mjs`: migration contract tests.
- Modify `cloudbase/functions/get-login-ticket/services/auth.cjs`: issue, hash, rotate, revoke, and validate refresh tokens.
- Modify `cloudbase/functions/get-login-ticket/auth-service.test.mjs`: auth lifecycle tests.
- Modify `cloudbase/functions/get-login-ticket/index.js`: `/auth/refresh`, `/auth/logout`, and `/app/version` routing.
- Modify `cloudbase/functions/get-login-ticket/auth-routes.test.mjs`: route and response tests.
- Create `cloudbase/functions/get-login-ticket/app-version-service.cjs`: read and normalize enabled Android release metadata.
- Create `cloudbase/functions/get-login-ticket/app-version-service.test.mjs`: version service tests.
- Modify `mini-program/src/auth/auth-store.ts`: add optional refresh token to the active session type.
- Modify `mini-program/src/auth/session-manager.ts`: persist rotated sessions and perform one shared refresh.
- Create `mini-program/src/auth/session-manager.test.ts`: persisted/rotated/legacy session tests.
- Modify `mini-program/src/api/android-auth-api.ts`: expose refresh/logout requests without leaking credentials into debug tooling.
- Modify `mini-program/src/api/android-auth-api.test.ts`: refresh and logout request tests.
- Modify `mini-program/src/api/product-api-client.ts`: retry one request after a shared refresh and distinguish transient failures from invalid refresh tokens.
- Create `mini-program/src/api/product-api-client.test.ts`: concurrent 401, replay, and failure tests.
- Modify `mini-program/src/pages/android-auth/index.tsx`: persist both tokens after login and registration.
- Modify `mini-program/src/auth/logout-flow.ts`: revoke the server refresh session before local clear.
- Create `android/app/src/main/java/com/lewislee/nordicnutri/AppUpdateBridge.java`: native version, installer source, market, verified download, and system installer bridge.
- Modify `android/app/build.gradle`: increment this feature build to `versionCode 2`, `versionName 1.1.0` so older APKs can detect it.
- Modify `android/app/src/main/java/com/lewislee/nordicnutri/MainActivity.java`: register `NordicAppUpdate`.
- Modify `android/app/src/main/AndroidManifest.xml`: add package-install permission and safe market intent visibility.
- Modify `android/app/src/main/res/xml/file_paths.xml`: expose only the update-cache subdirectory rather than broad external storage.
- Create `mini-program/src/features/app-update/app-update.ts`: version comparison, one-shot check, and bridge adapter.
- Create `mini-program/src/features/app-update/app-update.test.ts`: update decision tests.
- Create `mini-program/src/components/app-update-dialog/index.tsx`: update UI and progress behavior.
- Create `mini-program/src/components/app-update-dialog/index.scss`: Nordic dialog styles.
- Modify `mini-program/src/pages/home/index.tsx`: trigger the non-blocking update check once after authenticated Home appears.
- Modify `mini-program/src/app.tsx`: mount the global update dialog.

### Task 1: Add server-only refresh-session and release schema

**Files:**
- Create: `cloudbase/pg/migrations/0068_android_refresh_sessions_and_releases.sql`
- Create: `cloudbase/pg/migrations/0068_android_refresh_sessions_and_releases.test.mjs`

- [ ] **Step 1: Write the failing migration contract test**

Assert that the SQL creates `auth_refresh_sessions` with a unique SHA-256 token hash, user FK, token version, expiry/revocation/rotation fields, RLS plus revoked public roles; creates `app_releases` with Android channel/version/hash constraints; and provides a `rotate_auth_refresh_session` security-definer RPC that locks the old token and inserts the replacement atomically.

```js
assert.match(sql, /create table if not exists public\.auth_refresh_sessions/i);
assert.match(sql, /token_hash char\(64\).*unique/is);
assert.match(sql, /for update/is);
assert.match(sql, /create table if not exists public\.app_releases/i);
assert.match(sql, /apk_sha256 char\(64\)/i);
assert.match(sql, /enable row level security/gi);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test cloudbase/pg/migrations/0068_android_refresh_sessions_and_releases.test.mjs`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Implement the migration**

Use UUID primary keys, `on delete cascade` from refresh sessions to `app_users`, partial indexes for live tokens/releases, and no client grants. The rotation RPC accepts old hash, new hash, expected user/token version, new expiry, and timestamp; it returns the new session id only when the old row is live and matches.

- [ ] **Step 4: Run migration tests and existing auth migration tests**

Run: `node --test cloudbase/pg/migrations/0068_android_refresh_sessions_and_releases.test.mjs cloudbase/pg/migrations/0059_simplified_android_auth_v1.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit only migration files**

```bash
git add cloudbase/pg/migrations/0068_android_refresh_sessions_and_releases.sql cloudbase/pg/migrations/0068_android_refresh_sessions_and_releases.test.mjs
git commit -m "feat: add android refresh and release schema"
```

### Task 2: Issue and rotate refresh tokens in the existing auth service

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/services/auth.cjs`
- Modify: `cloudbase/functions/get-login-ticket/auth-service.test.mjs`

- [ ] **Step 1: Add failing service tests**

Cover these exact outcomes:

```js
assert.equal(result.session.expiresIn, 60 * 60 * 24 * 7);
assert.equal(result.session.refreshExpiresIn, 60 * 60 * 24 * 30);
assert.equal(typeof result.session.refreshToken, "string");
assert.equal(saved.tokenHash.length, 64);
assert.notEqual(saved.tokenHash, result.session.refreshToken);
```

Also verify rotation returns a different refresh token, rejects reused/expired/revoked tokens with `AUTH_REFRESH_INVALID`, rejects a changed `token_version`, and `logout(refreshToken)` revokes only that device session.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test cloudbase/functions/get-login-ticket/auth-service.test.mjs`

Expected: FAIL because login responses have no refresh token and refresh/logout methods do not exist.

- [ ] **Step 3: Add minimal repository methods**

Extend `createAuthRepository` with `insertRefreshSession`, `rotateRefreshSession` using the RPC, `findRefreshSessionByHash`, and `revokeRefreshSession`. Keep the table inaccessible outside the service role.

- [ ] **Step 4: Add token generation and lifecycle methods**

Use `randomBytes(32).toString("base64url")`, hash with the existing auth HMAC helper under purpose `refresh-token`, set a 30-day expiry, and return the plain token only in the response. Add `refresh(refreshToken)` and `logout(refreshToken)` to `createAuthService`; issue a fresh access token and rotating refresh token only after reloading an active user whose `token_version` still matches.

- [ ] **Step 5: Run auth tests and verify GREEN**

Run: `node --test cloudbase/functions/get-login-ticket/auth-service.test.mjs`

Expected: PASS with no plaintext token assertions in logs or repository rows.

- [ ] **Step 6: Commit the auth service change**

```bash
git add cloudbase/functions/get-login-ticket/services/auth.cjs cloudbase/functions/get-login-ticket/auth-service.test.mjs
git commit -m "feat: rotate android refresh tokens"
```

### Task 3: Expose refresh/logout and app-version HTTP routes

**Files:**
- Create: `cloudbase/functions/get-login-ticket/app-version-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/app-version-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/auth-routes.test.mjs`

- [ ] **Step 1: Write failing route and version tests**

Verify POST-only `/auth/refresh` and `/auth/logout`, public GET-only `/app/version`, no bearer requirement for version lookup, and normalized response shape:

```js
{
  platform: "android",
  channel: "direct",
  versionCode: 2,
  versionName: "1.1.0",
  apkUrl: "https://.../nordic-1.1.0.apk",
  apkSha256: "<64 lowercase hex>",
  marketUrl: "market://details?id=com.lewislee.nordicnutri",
  releaseNotes: ["登录状态自动续期"],
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test cloudbase/functions/get-login-ticket/auth-routes.test.mjs cloudbase/functions/get-login-ticket/app-version-service.test.mjs`

Expected: FAIL because routes and service do not exist.

- [ ] **Step 3: Implement the release reader**

Read only the highest enabled `version_code` matching `platform=android` and requested channel, validate HTTPS APK URLs and lowercase SHA-256, and return `{ update: null }` when no release exists. Do not require authentication and do not expose database fields unrelated to updates.

- [ ] **Step 4: Wire the routes**

Add `/auth/refresh` and `/auth/logout` to `getAuthRoute`; dispatch their bodies to the existing auth service. Add a narrow GET `/app/version` branch before authenticated product routes and pass the requested channel through the version service.

- [ ] **Step 5: Run focused and entrypoint tests**

Run: `node --test cloudbase/functions/get-login-ticket/auth-routes.test.mjs cloudbase/functions/get-login-ticket/app-version-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit HTTP surface changes**

```bash
git add cloudbase/functions/get-login-ticket/app-version-service.cjs cloudbase/functions/get-login-ticket/app-version-service.test.mjs cloudbase/functions/get-login-ticket/index.js cloudbase/functions/get-login-ticket/auth-routes.test.mjs
git commit -m "feat: expose session refresh and android releases"
```

### Task 4: Persist and refresh Android sessions safely

**Files:**
- Modify: `mini-program/src/auth/auth-store.ts`
- Modify: `mini-program/src/auth/session-manager.ts`
- Create: `mini-program/src/auth/session-manager.test.ts`
- Modify: `mini-program/src/api/android-auth-api.ts`
- Modify: `mini-program/src/api/android-auth-api.test.ts`
- Modify: `mini-program/src/pages/android-auth/index.tsx`

- [ ] **Step 1: Write failing client session tests**

Verify legacy `{ user, accessToken }` sessions still restore, new sessions persist `refreshToken`, two concurrent refresh calls share one HTTP request, success atomically replaces both tokens, transient/network errors leave storage untouched, and `AUTH_REFRESH_INVALID` clears only through the caller's invalid-session path.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir mini-program vitest run src/auth/session-manager.test.ts src/api/android-auth-api.test.ts`

Expected: FAIL because refresh-token fields and API methods are missing.

- [ ] **Step 3: Extend session and API types**

Add optional `refreshToken` to `AppAuthSession`; add `refreshToken` and `refreshExpiresIn` to `AndroidAuthSessionResult.session`; add `refresh(refreshToken)` and `logout(refreshToken)` API calls. Redact request bodies from vConsole exactly as existing credential requests do.

- [ ] **Step 4: Implement shared refresh**

Replace the current no-op `refreshSession()` with one in-flight promise that reads the persisted refresh token, calls `/auth/refresh`, validates user and both returned tokens, persists the replacement, and updates Zustand. Throw transient errors without deleting storage; return `null` only for an absent or definitively invalid refresh token.

- [ ] **Step 5: Persist both tokens after login**

Change `setNativeSession` to accept the returned session object and update Android auth completion to pass both tokens. Keep deserialization compatible with old sessions.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `pnpm --dir mini-program vitest run src/auth/session-manager.test.ts src/api/android-auth-api.test.ts && pnpm --dir mini-program typecheck`

Expected: PASS.

- [ ] **Step 7: Commit client session changes**

```bash
git add mini-program/src/auth/auth-store.ts mini-program/src/auth/session-manager.ts mini-program/src/auth/session-manager.test.ts mini-program/src/api/android-auth-api.ts mini-program/src/api/android-auth-api.test.ts mini-program/src/pages/android-auth/index.tsx
git commit -m "feat: refresh android sessions automatically"
```

### Task 5: Retry authenticated product requests once and revoke on logout

**Files:**
- Modify: `mini-program/src/api/product-api-client.ts`
- Create: `mini-program/src/api/product-api-client.test.ts`
- Modify: `mini-program/src/auth/logout-flow.ts`
- Modify or create: `mini-program/src/auth/logout-flow.test.ts`

- [ ] **Step 1: Write failing retry/logout tests**

Test one 401 followed by refresh and one replay, concurrent 401 responses sharing one refresh, replayed 401 clearing the session, network/503 preserving the session, and logout attempting server revocation before local clear even when revocation fails.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir mini-program vitest run src/api/product-api-client.test.ts src/auth/logout-flow.test.ts`

Expected: FAIL because requests clear immediately and logout never calls the server.

- [ ] **Step 3: Implement a single replay boundary**

Extract an internal `requestOnce`; on the first 401 call shared `refreshSession()`, then replay with the new access token exactly once. Preserve existing `SESSION_USER_MISSING` cleanup. Do not refresh `/auth/refresh` itself.

- [ ] **Step 4: Revoke on explicit logout**

Read the current refresh token, call `/auth/logout` best-effort, then always clear local state and navigate to login. Account cancellation and password reset continue to invalidate via `token_version` even if explicit revocation is unavailable.

- [ ] **Step 5: Run focused tests and auth bootstrap regression**

Run: `pnpm --dir mini-program vitest run src/api/product-api-client.test.ts src/auth/logout-flow.test.ts tests/auth-bootstrap.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit request retry changes**

```bash
git add mini-program/src/api/product-api-client.ts mini-program/src/api/product-api-client.test.ts mini-program/src/auth/logout-flow.ts mini-program/src/auth/logout-flow.test.ts
git commit -m "fix: retry expired android sessions once"
```

### Task 6: Add the restricted Android app-update bridge

**Files:**
- Create: `android/app/src/main/java/com/lewislee/nordicnutri/AppUpdateBridge.java`
- Create: `android/app/src/test/java/com/lewislee/nordicnutri/AppUpdateBridgeTest.java`
- Modify: `android/app/src/main/java/com/lewislee/nordicnutri/MainActivity.java`
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/res/xml/file_paths.xml`

- [ ] **Step 1: Write failing Java unit tests for pure helpers**

Cover lowercase SHA-256 calculation, HTTPS-only URL acceptance, current `versionCode` serialization, and rejection of mismatched expected hashes. Keep network and Intent operations behind small injectable helpers so JVM tests do not need a device.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd android && ./gradlew testDebugUnitTest --tests com.lewislee.nordicnutri.AppUpdateBridgeTest`

Expected: FAIL because the bridge does not exist.

- [ ] **Step 3: Implement the JS bridge**

Expose only:

```java
@JavascriptInterface String getCurrentVersion();
@JavascriptInterface String getInstallerSource();
@JavascriptInterface boolean openMarket(String marketUrl);
@JavascriptInterface void downloadAndInstall(String httpsUrl, String expectedSha256);
```

Download to `cacheDir/app-updates/update.apk`, cap redirects to HTTPS, calculate SHA-256 while streaming, delete failures, emit progress/result events on the WebView, and use `FileProvider` plus `ACTION_VIEW` for the system installer. If unknown-source permission is missing, open the package-specific Android settings screen; never silently install.

- [ ] **Step 4: Restrict manifest and provider paths**

Add `REQUEST_INSTALL_PACKAGES`, market intent visibility, and replace broad external paths with `<cache-path name="app_updates" path="app-updates/" />` plus the existing required image cache path only.

- [ ] **Step 5: Register the bridge and increment the app version**

Register `NordicAppUpdate` in `MainActivity` and set `versionCode 2`, `versionName "1.1.0"` in `android/app/build.gradle`. This is the first updater-capable release; all later releases must monotonically increase `versionCode`.

- [ ] **Step 6: Run Android checks**

Run: `cd android && ./gradlew testDebugUnitTest compileDebugJavaWithJavac`

Expected: PASS.

- [ ] **Step 7: Commit native update support**

```bash
git add android/app/src/main/java/com/lewislee/nordicnutri/AppUpdateBridge.java android/app/src/test/java/com/lewislee/nordicnutri/AppUpdateBridgeTest.java android/app/src/main/java/com/lewislee/nordicnutri/MainActivity.java android/app/build.gradle android/app/src/main/AndroidManifest.xml android/app/src/main/res/xml/file_paths.xml
git commit -m "feat: add verified android app updates"
```

### Task 7: Add one-shot Home update check and Nordic dialog

**Files:**
- Create: `mini-program/src/features/app-update/app-update.ts`
- Create: `mini-program/src/features/app-update/app-update.test.ts`
- Create: `mini-program/src/components/app-update-dialog/index.tsx`
- Create: `mini-program/src/components/app-update-dialog/index.scss`
- Modify: `mini-program/src/pages/home/index.tsx`
- Modify: `mini-program/src/app.tsx`

- [ ] **Step 1: Write failing update-decision tests**

Verify no dialog for equal/older versions, newer `versionCode` wins regardless of version-name formatting, market-installed builds prefer `openMarket`, direct installs expose APK fallback, a missing bridge is a no-op, and concurrent Home appearances perform one check.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir mini-program vitest run src/features/app-update/app-update.test.ts`

Expected: FAIL because update coordination does not exist.

- [ ] **Step 3: Implement the update coordinator**

Fetch `/app/version?platform=android&channel=<installer-source>`, compare integer version codes, store dialog/progress/error state in a small Zustand store, and subscribe once to native progress/result events. Version-service failures remain silent and never affect Home data.

- [ ] **Step 4: Implement the dialog**

Render version name, release notes, primary market action when available, “站内更新” fallback, “稍后提醒”, deterministic download progress, retryable failure copy, and disabled duplicate actions. Use existing dialog/overlay primitives and Nordic tokens; add no page-specific fixed positioning hacks.

- [ ] **Step 5: Trigger after authenticated Home opens**

Call `checkAndroidAppUpdateOnce()` in Home's Android `useDidShow` path after onboarding routing has passed. Mount `AppUpdateDialog` once beside the existing global transition overlay.

- [ ] **Step 6: Run tests, typecheck, and targeted lint**

Run: `pnpm --dir mini-program vitest run src/features/app-update/app-update.test.ts && pnpm --dir mini-program typecheck && pnpm --dir mini-program exec eslint src/features/app-update src/components/app-update-dialog src/pages/home/index.tsx src/app.tsx`

Expected: PASS.

- [ ] **Step 7: Commit update UI**

```bash
git add mini-program/src/features/app-update mini-program/src/components/app-update-dialog mini-program/src/pages/home/index.tsx mini-program/src/app.tsx
git commit -m "feat: prompt android users to update"
```

### Task 8: Integrate, deploy to DEV, build, and verify on device

**Files:**
- Modify only if required by verified integration failures.
- Use migration and release rows created in Tasks 1–3.

- [ ] **Step 1: Run the complete focused verification set**

Run:

```bash
node --test cloudbase/pg/migrations/0068_android_refresh_sessions_and_releases.test.mjs cloudbase/functions/get-login-ticket/auth-service.test.mjs cloudbase/functions/get-login-ticket/auth-routes.test.mjs cloudbase/functions/get-login-ticket/app-version-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs
pnpm --dir mini-program vitest run src/auth/session-manager.test.ts src/api/android-auth-api.test.ts src/api/product-api-client.test.ts src/auth/logout-flow.test.ts tests/auth-bootstrap.test.ts src/features/app-update/app-update.test.ts
pnpm --dir mini-program typecheck
```

Expected: all focused tests and typecheck PASS.

- [ ] **Step 2: Review CloudBase code before remote changes**

Run the CloudBase code-review checklist: no plaintext refresh tokens, no client grants on server-only tables, strict user ownership, no production identifiers, no secret output, and explicit DEV EnvId `test-dev-d4gyxnn0b5dfa2c8a`.

- [ ] **Step 3: Apply migration to DEV and verify schema**

Use `managePgDatabase(action="applyMigration", envId="test-dev-d4gyxnn0b5dfa2c8a", migrationVersion="0068", ...)`, then query `information_schema` and constraints/policies. Do not touch production.

- [ ] **Step 4: Deploy only `get-login-ticket` to DEV and read back status**

Update the existing function code while preserving its configuration and secrets. Verify `Active / Available`, then smoke-test `/app/version`, login, refresh rotation, reused-token rejection, logout revocation, and `/auth/me` with the rotated access token. Never print token values.

- [ ] **Step 5: Build and sync Android**

Run:

```bash
pnpm --dir mini-program build:android
npx cap sync android
cd android && ./gradlew assembleDebug
```

Expected: H5 build, Capacitor sync, and debug APK assembly PASS.

- [ ] **Step 6: Upload the DEV APK and seed one DEV release row**

Calculate the built APK's SHA-256, upload it to DEV CloudBase Storage, and insert an enabled `direct` release row only after URL and hash readback. The seed must reference `versionCode 2`; do not create a production release row.

- [ ] **Step 7: Install on the explicitly selected OnePlus device**

Run `adb devices -l`, confirm the current OnePlus serial, then `adb -s <serial> install -r android/app/build/outputs/apk/debug/app-debug.apk`.

Expected: `Success`; no emulator installation unless separately requested.

- [ ] **Step 8: Perform real-device acceptance**

Verify: login persists after restart; forced access-token expiry refreshes without opening login; offline launch preserves the session; explicit logout revokes and returns to login; Home remains usable when version service fails; a newer direct release shows the dialog; market action resolves when a market is present; direct download reports progress, verifies hash, opens system installer, installs over the old APK, and preserves app data.

- [ ] **Step 9: Record evidence and final status**

Report backend tests, frontend tests, migration readback, DEV function status, APK path/hash, target device/install result, and each real-device behavior separately. Mark anything not exercised as `NOT VERIFIED`; do not call production or market publication complete.
