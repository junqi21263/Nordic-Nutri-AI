# Android Dev → Prod 发布步骤

环境：Dev `test-dev-d4gyxnn0b5dfa2c8a`；Prod `lewis-healthy-d4glgqqzv73a5bc10`。每次远端操作都显式指定并再次核对完整 EnvId。代码合并、云端部署和 APK 发布是三个独立步骤。

## 0. 版本、依赖与 APK 归档约定

- App 版本只以 `android/app/build.gradle` 的 `versionName` 和 `versionCode` 为准；根目录及 `mini-program/package.json` 的版本是 JS 包元数据，不代表 Android App 版本。
- `versionName` 使用 `主版本.次版本.修订号`；Dev 与 Prod 是独立版本流，DEV 调试可自行递增，不要求与 Prod 对齐。Prod 的 `versionCode` 只按当前已发布的 Prod APK 加 1，`versionName` 也从当前 Prod 版本递增；发布时不因 DEV 版本较高而跳号。每个渠道内的 `versionCode` 必须严格递增且不可复用。Prod 候选代码仍需完成目标环境验证；若验收后有代码修复，应重新构建候选包。
- Dev、Prod 使用不同 Android applicationId：Dev `com.lewislee.nordicnutri.dev`，Prod `com.lewislee.nordicnutri`。Dev 用 debug 签名，Prod 只用受控的 Prod 签名。禁止把 Dev 包上传到官网或写入 Prod 的版本元数据。
- pnpm 版本固定为根 `package.json` 的 `packageManager`（当前 `pnpm@10.33.0`），依赖解析以 `pnpm-lock.yaml` 为准。干净环境安装用 `corepack pnpm install --frozen-lockfile`；改依赖必须一并提交 lockfile。Android 构建使用 Node `24.18.x`。
- APK 和 manifest 都不进 Git。`output/` 是本地交付物目录，按 `output/android/<dev|prod>/<versionName>-<versionCode>/<sourceCommitShort>/` 保存，每个目录含 APK 与 `manifest.json`。文件名带渠道、版本和提交短 SHA。已归档目录不可覆盖或自动删除；同一提交需要重新打包时先提升版本并提交新源码。
- manifest 记录环境、分支、完整源码 SHA、App 包名/版本、构建时间、APK SHA-256、签名证书 SHA-256，以及“清单/签名/真机”各自状态。`PASS` 的签名和清单检查不代表真机验收通过。

首次准备 DEV 本地配置：复制仓库根目录 `.env.dev.local.example` 为 `.env.dev.local`，填写 DEV Google Server Client ID。真实配置文件被 Git 忽略。打包脚本固定注入 DEV API、DEV auth/backend flags，并验证 Android 包名、版本与 APK 签名。

标准命令：

```sh
# 在已推送且干净的 Android-dev 上生成、校验并归档 DEV APK
corepack pnpm android:dev:package

# 在 Android-prod 上执行 Prod 签名构建与官网版本元数据更新
corepack pnpm android:prod:release
```

Prod 命令是正式发布流程，不用于日常打包；它仍要求当前提交等于 `origin/Android-prod`、工作区干净、生产签名配置正确，并会拒绝覆盖既有归档目录。

## 1. 冻结代码与回滚点

1. 开始下一轮开发前，先把上一轮 Prod 的代码修正回流到 Dev 基线，再在 `Android-dev` 完成开发和 Dev 真机验收。提交本次要发布的改动；不要把未提交文件、日志、APK、密钥或 `google-services.json` 的 release 副本带入发布提交。
2. 记录 Dev 验收的提交 SHA、功能范围、相关迁移文件与版本、函数名单、变量名称、当前 APK `versionCode` 和回滚提交。检查 `git status --short`、`git diff --check`、与远端的分叉及待合并提交。
3. 将经过验收的 Dev 提交合入正式 `Android-prod` 分支，并确认它跟踪 `origin/Android-prod`。临时集成分支仅在本地使用，完成后删除，不作为远端长期分支。确认发布分支包含 Dev 提交，也保留已有 Prod 修正。若合并时产生代码修复，应先将修复回流 Dev 并重新验收新的发布提交，避免把未在 Dev 验收的组合直接部署 Prod。
4. 仅从干净、已提交的发布提交构建和部署。任何发布后修正都要形成新提交并更新发布记录，不要让 APK 与云函数对应不同的未记录源码。

## 2. Dev 验收与数据库迁移

1. 先在 Dev 执行有针对性的代码检查和真机流程，记录结果。检查云函数与客户端是否使用 Dev 地址、Dev Storage 和测试数据。
2. 新 PG 迁移放入 `cloudbase/migrations/`，使用唯一的 14 位 `migrationVersion`、小写 `migrationName` 和确定的 SQL。对 Dev 用 CloudBase `planMigration` 预览，再用**同一**名称、版本、SQL 执行 `applyMigration`；等待任务终态，并回读迁移历史和目标表/列/策略。
3. 发布前对 Prod 重复预览，核对影响范围和向前修复方案，再应用并回读。禁止用手工 DDL 绕开迁移历史；优先兼容性迁移，再部署依赖新结构的代码。没有数据库变化则在发布记录中标记“不适用”。

## 3. 云函数、变量和发布证据

1. 对比 Dev 与 Prod 的函数名单、运行时、触发器、超时、调用地址及变量**名称和是否存在**。不要把变量值打印到终端日志或发布包。Prod `get-login-ticket` 的 FCM 套件包括 `project_id`、`client_email`、`private_key`、`FCM_RELAY_URL`、`FCM_RELAY_SHARED_SECRET`；经批准可与 Dev 共享。`TCB_ENV`、数据库连接、开关和其他凭据仍逐项按环境确认。
2. 在目标分支运行 `pnpm deploy:cloudbase test <function> --dry-run` 或 `pnpm deploy:cloudbase production <function> --dry-run`，核对输出的 EnvId 后才执行同样命令但去掉 `--dry-run`。仅部署本次涉及的函数。Prod 先迁移、再函数、再做只读或低风险 smoke；确认真实发送服务时要用专门的测试账号和受控收件人。
3. 部署后回读函数状态、运行时、触发器、配置和代码版本/产物摘要。`Active` 只代表函数可用，不等于业务端到端通过。`nordic-ai-worker-prod` 是清单外的遗留依赖，其云端代码入口与仓库 `hunyuan-image-worker` 一致，但函数名和变量配置需单独核对，见 `PROD_FUNCTION_INVENTORY.md`；改变其路由前必须完成独立验收。
4. 可用 `node scripts/release/create-production-release-bundle.mjs` 生成候选发布包。脚本中的 `NOT_VERIFIED` 字段必须用实际迁移历史、Prod 回读、测试和回滚证据补齐；不能把候选包直接称为完成发布。

GitHub Actions 的 `Android release checks` 只核对分支/函数配置契约、类型和 Prod H5 构建；云端迁移、变量值、签名 APK 和真机验收仍按本清单单独回读。

## 4. 构建 Prod APK

1. 将 `android/app/build.gradle` 的 `versionCode` 设为当前已发布 Prod APK 的 `versionCode + 1`，按 Prod 自己的版本流递增 `versionName`。确认 `.env.production` 的 API Base URL、Google Server Client ID、正式插画 CDN 和登录开关指向 Prod；不要把服务端密钥放进前端环境文件。
2. 将非秘密签名元数据写入被 Git 忽略的 `android/signing.local.json`，密码从本机 Keychain 读取。密码不能写进命令行参数、Git 或聊天。使用项目要求的 Node 24.18.x 和 `node scripts/android-release.mjs` 从干净的 `Android-prod` 提交构建、验签并同步官网 APK/版本元数据。
3. 在 `android/app/src/release/google-services.json` 放入包含 `com.lewislee.nordicnutri` 的 Firebase 配置，并确认该 Android 应用登记了 Prod 签名证书 SHA-1/SHA-256。此文件被 Git 忽略；新工作区需重新安全配置。仓库根目录下的 `android/app/google-services.json` 当前仅含 Dev 包名，不可代替 release 文件。
4. 从仓库根目录依次运行：

   ```sh
   pnpm --dir mini-program run build:android:prod
   pnpm exec cap sync android
   ./android/gradlew -p android assembleRelease
   ```

5. 用 Android SDK `apksigner verify --print-certs` 核对 APK 签名证书、`aapt dump badging` 核对包名和版本，并计算 `shasum -a 256`。检查包内 Prod API 地址与原生 `push_receipt_api_base_url`，记录 APK 路径、SHA-256、源码提交、构建时间和回滚 APK。不要只根据 `BUILD SUCCESSFUL` 判断配置正确。
6. 给实际签名 APK 对应的源码提交打 `android-v<versionName>` 标签并推送；后续文档或脚本提交不得代替这个回溯点。官网发布和 CloudBase 版本登记分别核对相同的 APK SHA-256。

## 5. 安装、发布与回滚

1. 在真实 Android 设备安装候选 APK，逐项验证 Prod 登录、短信/邮箱验证码、会话刷新、识图、FCM token 注册、通知到达和回执；同时回读 Prod 日志与数据库，确认没有写入 Dev。无设备或无受控测试账号的项目标记 `NOT VERIFIED`，不把构建成功当作验收。
2. 若通过 App 内更新发布，还需先上传已核验的 APK，回读下载地址和 SHA-256，再登记版本记录；不能仅上传文件就宣称用户可更新。若仅交付 APK，记录交付路径与安装验收责任人。
3. 出现问题时先停止分发并关闭相关功能开关；云函数回到上一个稳定提交/版本，APK 回到已保存的上一版。数据库优先用新的向前修复迁移，不对生产数据直接执行破坏性回滚。

发布记录至少包含：Dev 与 Prod EnvId、源/发布提交、Dev 验收、迁移预览/任务/历史/结构回读、函数和变量名称回读、APK 版本/包名/签名/哈希、真机结果、上一个稳定版本及回滚点。每项分别标记 `PASS`、`FAIL` 或 `NOT VERIFIED`。
