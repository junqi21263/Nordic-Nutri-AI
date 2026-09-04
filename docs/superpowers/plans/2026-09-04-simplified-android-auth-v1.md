# Simplified Android Email Auth V1

本轮只实现 Android/H5 的 Email Auth；微信小程序认证链路、业务 API 和 `public.app_users.id` 保持不变。暂不实现 Google、Phone、SMS、账号绑定、Refresh Token、设备会话和复杂风控。

## 1. 文件结构

后端继续使用现有 CloudBase HTTPS Function：

- `cloudbase/functions/get-login-ticket/services/auth.cjs`：Email 注册、登录、验证码、密码、Bearer Token、`/auth/me`。
- `cloudbase/functions/get-login-ticket/services/captcha.cjs`：`svg-captcha` 生成和验证，不新增 CAPTCHA 表。
- `cloudbase/functions/get-login-ticket/services/email.cjs`：Brevo 邮件发送边界。
- `cloudbase/functions/get-login-ticket/index.js`：配置和 Email Auth 路由。
- `cloudbase/pg/migrations/0059_simplified_android_auth_v1.sql`：未执行的 DEV/生产前迁移文件。

客户端继续使用 Taro H5 + Capacitor：

- `mini-program/src/api/android-auth-api.ts`：Email Auth HTTP API。
- `mini-program/src/pages/android-auth/index.tsx`：登录、注册、邮箱验证码、忘记密码、重置密码。
- `mini-program/src/auth/app-auth-bootstrap.ts`：Android 启动时调用 `/auth/me`。
- `mini-program/src/platform/secure-token-storage.ts`：安全存储边界。
- `android/app/src/main/java/com/lewislee/nordicnutri/SecureStorageBridge.java`：Android Keystore AES-GCM 密文存储。

## 2. 数据库改动

只扩展现有 `public.app_users`：

```text
email
email_normalized
email_verified_at
password_hash
status                 -- 已存在，迁移只兼容检查
token_version
created_platform
password_changed_at
```

`email_normalized` 建唯一部分索引；新 Android 用户由服务端写入 `created_platform = 'android_app'`，旧小程序用户默认 `wechat_mini_program`。不限制用户后续平台。

新增唯一一张服务端表 `public.auth_verification_codes`，用于 Email OTP 和本地 SVG CAPTCHA：

```text
id, target, target_type, purpose, code_hash,
expires_at, attempt_count, used_at, created_at
```

Email target 使用服务端 HMAC 后的值；OTP 使用 `HMAC-SHA256(target + purpose + code)`，不存明文。验证码 6 位、10 分钟有效、60 秒重发、最多 5 次验证；同邮箱最多 5 次/小时。新验证码会使旧未使用验证码失效。表启用 RLS，客户端无权限，只通过服务端 RPC 消费。

迁移附带手动 rollback SQL 注释；本轮不执行 migration、不改生产数据库。

## 3. API

```text
POST /auth/captcha
POST /auth/register/email/send-code
POST /auth/register/email
POST /auth/login/email
POST /auth/password/forgot/email
POST /auth/password/reset
GET  /auth/me
```

登录使用 Email + Password + Image CAPTCHA，不使用 OTP。注册和忘记密码使用 Email OTP。登录失败统一返回 `AUTH_INVALID_CREDENTIALS`；验证码、限流、Provider 错误分别使用既有稳定错误码。

## 4. 页面

Android Auth 页面包含：

- Auth Landing / Email Login
- Email Registration
- Email Verification
- Forgot Password / Reset Password
- CAPTCHA、密码显示状态、Loading、Error、Success、提交防重复

Google 和 Phone 只保留禁用提示，不触发真实请求，也不伪造登录成功。小程序原有 `auth-entry` 页面不改。

## 5. Auth Flow

```text
注册：Email -> CAPTCHA -> 发送 Email OTP -> Code -> Password -> app_users -> 7-day Bearer
登录：Email -> Password + CAPTCHA -> Argon2id verify -> 7-day Bearer
忘记密码：Email -> CAPTCHA -> Email OTP -> New Password -> token_version + 1
启动恢复：安全存储 Token -> GET /auth/me -> 校验 user/version -> 复用业务 API
```

Token 为现有 HMAC Bearer 形式，至少包含 `sub`、`ver`、`exp`，有效期 7 天。密码修改后递增 `token_version`，旧 Token 自动失效；不实现 Refresh Token Rotation 或 Session Family。

## 6. Security Minimum

- Argon2id；密码长度 8–128，不强制字符类别。
- OTP/CAPTCHA 不进入日志、Trace、响应；Provider key 只在 CloudBase Function 环境变量。
- `svg-captcha` 使用服务端保存的 HMAC challenge，答案不返回客户端。
- CAPTCHA 必须先通过才能发 Email 或尝试登录。
- Email OTP 60 秒重发、5 次/小时；登录按 Email/IP 做 15 分钟 5 次失败限制。
- 登录失败不区分未知邮箱和错误密码。
- Android Token 使用 Android Keystore 保护 AES-GCM 密钥，SharedPreferences 只保存密文；不使用普通 localStorage/AsyncStorage 保存长期 Token。
- 登录 limiter 是进程内最小实现；只有 abuse 或规模证明需要时才升级共享限流存储。

## 7. Test List

- Email normalize、无效邮箱、重复邮箱。
- CAPTCHA 正确/错误/过期/重放，且 CAPTCHA 失败不发送邮件。
- OTP 正确、错误、过期、重放、重发和 5 次/小时限流。
- Password Argon2id seam、长度边界、错误密码。
- Email 注册、登录、未知邮箱统一错误、登录 CAPTCHA 错误、Email Provider 错误。
- Bearer 签名、7 天过期、`sub`、`ver`、`token_version` 失效。
- `/auth/me` 最小字段和无效 Token。
- Forgot Password、旧密码拒绝、旧 Token 失效。
- Android API 路径、页面模式、启动时 `/auth/me`、安全存储桥接。
- 现有后端测试、Taro TypeScript、Lint、H5 Build、Capacitor Sync、Debug/Release Compile。

真实 Android 设备、真实 Brevo 投递、DEV migration 和生产部署不在本轮验证范围，均需后续明确批准。

## 8. 开发顺序

1. 审计现有 `app_users`、Bearer verifier 和小程序登录路径。
2. 编写并检查未执行的 migration。
3. TDD 实现 CAPTCHA、Email、Argon2id、OTP、Email Auth 服务。
4. 接入 Email-only API 路由和 `/auth/me`。
5. 接入 Android Auth 页面和 `/auth/me` 启动校验。
6. 接入 Android Keystore 安全存储桥接。
7. 运行后端/前端测试、Taro 检查和 Android Build Regression。
8. 进行 CloudBase code review；停止在 Email Auth，不进入 Phone/Google。
