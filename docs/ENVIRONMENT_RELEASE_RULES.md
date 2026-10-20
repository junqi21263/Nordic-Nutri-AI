# Dev 与生产环境开发、更新、合并规则

## 1. 环境与分支固定映射

| Git 分支 | CloudBase 环境 | 用途 | 数据边界 |
|---|---|---|---|
| `develop` / `Android-dev` | `test-dev-d4gyxnn0b5dfa2c8a` | 开发、联调、验收 | 只允许测试账号、测试数据、测试 Storage |
| `main` / `Android-prod` | `lewis-healthy-d4glgqqzv73a5bc10` | 生产发布 | 真实用户、真实数据、生产 Storage |

分支名和 CloudBase 环境必须同时确认。Git merge 只改变代码，不会自动部署任何 CloudBase 环境。
GitHub 长期分支仅保留 `main`、`develop`、`Android-dev`、`Android-prod`。功能或发布集成分支可以在本地短暂使用，完成后合回相应长期分支并删除。已签名 Android APK 的精确源码提交用 `android-v<versionName>` 标签固定；`main` 的后续管理提交不改变已发布 APK 的源码身份。

仓库中的 `cloudbaserc.json` 保持生产 EnvId，供生产发布包和既有发布流程使用。部署云函数时，通过统一入口显式选择目标；脚本从该清单生成临时目标配置，不修改仓库清单：

```sh
pnpm deploy:cloudbase test get-login-ticket --dry-run
pnpm deploy:cloudbase test get-login-ticket
pnpm deploy:cloudbase production get-login-ticket --dry-run
pnpm deploy:cloudbase production get-login-ticket
```

将函数名替换为目标函数；仅在确实需要全量更新时，将函数名改为 `--all`。脚本会校验上表中的分支与环境映射。`--dry-run` 只展示目标，不执行部署。`cloudbaserc.json` 是仓库管理的生产函数清单；脚本仅对 Dev 加入 `hunyuan-image-worker` 和 `nutrition-insight-worker`。清单外生产依赖见 `docs/PROD_FUNCTION_INVENTORY.md`。

## 2. 开发规则

1. 小程序新功能从 `develop` 创建 `feature/<short-name>`；Android 后续开发从 `Android-dev` 创建功能分支，按 `docs/ANDROID_DEV_TO_PROD_RELEASE.md` 晋升。
2. 日常开发、云函数更新、测试 Hosting 更新，只允许指向 `test-dev-d4gyxnn0b5dfa2c8a`。
3. 不得在代码、`.env`、小程序配置或文档中提交密钥。
4. 测试环境不得连接生产 PostgreSQL、生产 Storage、生产 Worker 或生产自定义域名。
5. 云函数内部调用必须使用测试环境地址；生产地址只能出现在生产配置或生产发布配置中。
6. 数据库变更必须先在测试环境执行并验证，再准备生产迁移脚本；禁止直接在生产库试验 SQL。

## 3. 测试环境更新规则

测试环境部署前必须完成：

- 确认当前分支是 `develop`、`feature/*` 或 `Android-dev`。
- 确认目标 EnvId 是 `test-dev-d4gyxnn0b5dfa2c8a`。
- 运行相关单元测试、类型检查或构建检查。
- 检查 `git diff --check`。
- 检查前端 API、云函数环境变量、数据库连接均为测试配置。
- 使用测试账号和测试数据完成至少一次真实接口验收。

测试环境允许频繁更新，但每次更新必须能通过 Git 提交或部署记录追溯。

## 4. 生产合并与发布规则

以下是小程序主线的合并路径。Android 使用 `Android-dev` → `Android-prod`，具体步骤见 Android 发布清单；确认生产版本后将已发布提交同步到 `main`，再回流 Dev。合并代码不会自动构建 APK 或部署云函数。

只有测试环境验收通过后，才允许：

1. 将 `feature/*` 合并到 `develop`。
2. 如需冻结发布范围，在本地创建短期发布集成分支，验收后删除。
3. 冻结本次发布范围，记录代码提交号、数据库迁移、环境变量变化和回滚点。
4. 将 release 分支合并到 `main`。
5. 明确执行生产数据库迁移（如有）。
6. 使用与测试环境相同的代码提交号部署生产云函数。
7. 用生产专用验证账号执行只读/低风险 Smoke Test。
8. 验证通过后再发布生产 Hosting 或小程序版本。

禁止直接在 `main` 上开发、直接修改生产函数代码或直接修改生产数据库结构。环境变量按名称和用途逐项核对，默认分别配置；经明确批准共享的 FCM 凭据可以复用，但 `TCB_ENV`、数据库连接和生产开关仍必须保持环境专属。不得将变量值写入 Git 或发布记录。

Android APK 的具体构建、签名、配置回读和真机验收顺序见 `docs/ANDROID_DEV_TO_PROD_RELEASE.md`。

Android 版本、依赖锁定、Dev/Prod 包名和 APK 归档按 `docs/ANDROID_DEV_TO_PROD_RELEASE.md` 第 0 节执行。APK 只能保存在被忽略的 `output/android/` 本地目录或既有正式下载目录，不提交 APK、签名材料和本机环境配置。

## 5. 云函数发布顺序

涉及数据库或接口变更时，固定采用：

```text
兼容性数据库迁移 → 生产云函数 → 生产只读 Smoke Test → 前端/小程序 → 功能开关
```

数据库优先采用向前兼容迁移：先新增字段/表，再部署兼容代码，确认稳定后再清理旧结构。不要先删除字段或改变旧字段含义。

## 6. 生产验证边界

生产验收优先验证：

- 登录与会话建立
- 只读食材查询
- 只读用户信息
- 后台登录
- 新接口返回结构
- 云函数日志和错误码

未经单独批准，不执行真实用户删除、真实图片清理、批量生图、额度扣减或大范围数据写入。

## 7. 回滚规则

- 云函数：重新部署上一个已验证的 Git 提交或函数版本。
- Hosting：恢复上一个构建产物。
- 小程序：停止继续发布，必要时恢复上一个可用版本。
- 数据库：优先执行向前修复迁移，不直接回滚破坏性 SQL。

每次生产发布必须保留上一个稳定提交号作为回滚点。

## 8. 合并前检查清单

- [ ] 测试环境验收通过，记录测试账号、时间和结果。
- [ ] `develop` 工作区干净。
- [ ] 单元测试、构建/类型检查通过。
- [ ] `git diff --check` 通过。
- [ ] 没有密钥、生产用户数据或测试账号密码进入 Git。
- [ ] 已确认数据库迁移顺序和回滚方案。
- [ ] 已确认生产云函数环境变量与测试环境不同但名称一致。
- [ ] 已确认生产前端 API、Storage/CDN、Worker 地址正确。
- [ ] 已确认本次发布不包含未验收的额外改动。

## 9. 当前项目的最短发布路径

```text
本地功能分支
  → develop
  → 部署 test-dev
  → 测试账号/测试数据验收
  → 本地短期发布集成分支（如需要）
  → main
  → 生产迁移与云函数
  → 生产专用 Smoke Test
  → 发布生产前端/小程序
```
