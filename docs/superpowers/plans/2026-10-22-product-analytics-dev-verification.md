# Product analytics DEV verification — 2026-10-22

Scope: `test-dev-d4gyxnn0b5dfa2c8a` and the Cloudflare preview site only. Production CloudBase, Android-prod, and `nutri.lewislee.online` were not deployed.

## Source and artifacts

- App/backend/admin: `Android-dev` commit `8c58e5e846b3e8a4bc104b76bc363e4d6ef22509`, pushed to `origin/Android-dev`.
- Website preview: separate site repository commit `22d491e` (local commit), Cloudflare preview Worker version `40b99e55-d0d5-4ed5-8f35-f37476b48a8b`. The site repository was not pushed to its remote.
- DEV APK: `output/android/dev/1.1.26-28/8c58e5e8/nordic-nutri-dev-1.1.26-28-8c58e5e8.apk`; SHA-256 `f8f1200f2b30f12a3d86da5f77e95d8f5b94b3701c7df50fe5aac7209025e382`. Package `com.lewislee.nordicnutri.dev`, version `1.1.26` / code `28`; debug signature and manifest verified by `scripts/android-dev-package.mjs`.
- A later narrow fix to expired report retry and report-history metadata is committed separately; it does not change the APK source.

## Verified gates

- DEV PG migrations `20261021010000`, `20261021020000`, and `20261021030000` are recorded. The third migration was previewed with 27 matching applied migrations, no conflicts, and one pending migration; task `task-fe70f18ad21c414a` reached `Succeed`. A read-only acquisition report query with `medium=social`, `content=dev_test`, `locale=zh-CN` succeeded.
- `get-login-ticket` and the five-minute `analytics-dispatcher` are Active in the DEV namespace; the timer configuration was read back. DEV admin static files are present and return HTTP 200. Anonymous access to the admin analytics report returned HTTP 401.
- DEV synthetic website event: anonymous grant succeeded; first batch returned `accepted`, replay returned `duplicate`, withdrawal succeeded, and a subsequent batch returned HTTP 403 `ANALYTICS_CONSENT_REVOKED`. The test event was classified `is_test` by the DEV schema. The filtered acquisition report returned one visitor, one page view, and channel `xiaohongshu` / medium `social` / content `dev_test`.
- Website preview homepage and analytics module returned HTTP 200; preview markup carried `nordic-analysis-target=preview`. The production homepage had no analysis target marker. Local browser checks covered default-off consent and preview event payloads with collector traffic intercepted.
- Tests: backend/admin/dispatcher 31 passed before final report retry fix; backend/admin 30 passed after it. App analytics 17 passed; mini-program typecheck and DEV Android H5 build passed. Website analytics 13 and release 9 passed; website build and DEV APK Gradle build passed. The H5 build emitted existing bundle-size warnings.

## Not verified

- No Android device was attached (`adb devices -l` returned an empty list). APK installation, signed-in consent restoration, native diagnostics, and actual meal/Nova/notification behavior remain `NOT VERIFIED` on a real device.
- An authenticated remote admin browser session and manual CSV/HTML export were not exercised. Authorization, history, formatting, and retry were checked through tests and remote permission smoke checks.
- Production CloudBase, production website analytics, production APK, and public release remain disabled/unmodified by this delivery.

The three unrelated Google authentication working-tree changes were excluded from the analytics commit, temporarily stashed for the clean-source DEV package script, and restored afterward.
