---
goal: Nordic Nutri AI development foundation initialization
version: 1.0
date_created: 2026-07-10
last_updated: 2026-07-10
owner: Nordic Nutri AI engineering
status: Planned
tags: [process, infrastructure, monorepo, supabase, wechat-miniprogram]
---

# Nordic Nutri AI 开发初始化实施方案 V1.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可持续迭代的微信小程序 + Supabase Monorepo 基础工程，不实现任何业务功能。

**Architecture:** 根仓库使用 pnpm workspace 管理小程序工具依赖、质量工具与 Supabase CLI；小程序与 Supabase 目录职责隔离。Supabase 本地栈、迁移和 Edge Functions 由 CLI 管理，远端 development/production 项目彼此隔离；所有业务能力在初始化后再按 PRD 实施。

**Tech Stack:** Node.js 24 LTS、pnpm 10、TypeScript 5.9、微信开发者工具稳定版、Supabase CLI 2.81.3+、Docker Desktop。

---

## 1. Requirements & Constraints

- **REQ-001**：创建单一 Git Monorepo，顶层必须有 `mini-program/`、`supabase/`、`docs/`、`scripts/`。
- **REQ-002**：小程序使用原生 TypeScript；不得在初始化阶段实现登录、营养、AI、扫描、Onboarding 或 Dashboard 业务逻辑。
- **REQ-003**：后端仅使用 Supabase Auth、PostgreSQL、Storage、Edge Functions；数据库变更只能通过版本化 migration 进入仓库。
- **REQ-004**：Supabase 在 local、development、production 三个环境隔离，生产数据不得用于本地调试。
- **SEC-001**：禁止提交微信 AppSecret、Supabase secret/service-role key、数据库密码、AI API Key、真实 OpenID、真实图片。
- **SEC-002**：所有未来暴露到 Data API 的 `public` 表必须启用 RLS，所有权判断以 `auth.uid()`/JWT `sub` 为准；不得以可编辑的 user metadata 授权。
- **SEC-003**：`food-images` 必须是私有 Storage bucket，路径首段为 Auth 用户 UUID；客户端不得有 upsert 权限。
- **CON-001**：本计划只初始化工程，不创建远端 Supabase 项目、不录入真实密钥、不部署 Function、不写业务 SQL 或业务页面。
- **CON-002**：当前工作区尚未初始化 Git；Task 1 负责建立仓库并保留已有 `docs/` 内容。
- **GUD-001**：所有命令在仓库根目录 `nordic-nutri-ai/` 执行；执行前先运行命令的 `--help` 以确认本机 CLI 版本支持该语法。
- **GUD-002**：依赖版本写入 `package.json` 和 lockfile；Supabase CLI 必须是本地 devDependency，不依赖开发者的全局版本。

## 2. 代码仓库规划

```text
nordic-nutri-ai/
├─ mini-program/                 # 原生微信小程序；独立 app 配置与页面源码
│  ├─ src/
│  │  ├─ pages/                  # 页面壳：只建空白路由和生命周期边界
│  │  ├─ components/             # 基础 UI：loading、empty-state、error-state
│  │  ├─ services/               # 未来业务编排层；初始化仅建立目录和说明
│  │  ├─ stores/                 # 未来会话/页面状态；初始化仅定义空模块边界
│  │  ├─ utils/                  # 环境读取、错误映射、日期/校验通用函数
│  │  ├─ api/                    # Supabase client、Function 调用和请求 DTO 边界
│  │  ├─ types/                  # 跨页面 TypeScript 类型与枚举
│  │  ├─ assets/                 # 图标、静态图、字体许可资源
│  │  └─ config/                 # 仅非敏感环境映射和环境样例
│  ├─ project.config.json        # 微信开发者工具项目配置（不含私密 AppID）
│  └─ README.md                  # 小程序启动与环境说明
├─ supabase/                     # Supabase CLI 生成及维护的目录
│  ├─ migrations/                # 仅顺序、不可改写的 DDL/RLS/索引 migration
│  ├─ functions/                 # 未来 Edge Functions；含 _shared/ 公共边界
│  ├─ seed/                      # 非敏感 food_catalog 种子数据
│  ├─ tests/                     # 未来 pgTAP/RLS/Function 合约测试
│  └─ config.toml                # 本地栈配置；可提交，不可包含真实 secret
├─ docs/                         # PRD、技术设计、实施计划、ADR、运行手册
│  ├─ superpowers/specs/
│  ├─ superpowers/plans/
│  └─ runbooks/
├─ scripts/                      # 不含密钥的可重复校验/生成命令
├─ .env.example                  # 变量名称与格式，不含真实值
├─ .gitignore                    # 覆盖 .env*、本地 Supabase 数据、IDE 临时文件
├─ .nvmrc                        # 锁定 Node 主版本
├─ package.json                  # workspace 根依赖、脚本、packageManager
├─ pnpm-workspace.yaml            # workspace 定义
├─ pnpm-lock.yaml                 # 锁定依赖树
├─ README.md                      # 根级启动、目录与安全说明
└─ CONTRIBUTING.md                # 分支、提交、迁移与 PR 规则
```

不创建 `packages/shared`：一期还没有被多个运行时共同消费的实现代码；过早抽包会增加构建与发布复杂度。只在小程序与 Edge Functions 真实共享稳定 schema 后，再通过 ADR 新增。

## 3. 开发环境要求

| 工具 | 锁定要求 | 用途与说明 |
| --- | --- | --- |
| Node.js | `24.18.0+`，24.x LTS | 根工具链、pnpm、Supabase CLI；生产开发仅采用 LTS 分支 |
| npm | Node 24 随附的 11.x | 仅用于启用 Corepack 或应急安装；仓库不使用 npm lockfile |
| pnpm | 10.x，根 `packageManager` 锁定精确 patch | workspace 安装、统一脚本与 lockfile |
| TypeScript | `~5.9.0` | 小程序与工具代码；初期不采用刚发布的 6.x 过渡版本 |
| Supabase CLI | `>=2.81.3 <3`，本地 devDependency | 本地栈、migration、Function、数据库 advisors |
| Docker Desktop | 当前稳定版，Docker Engine 可用 | Supabase 本地服务；启动前确认 Docker daemon 正常 |
| 微信开发者工具 | 当前稳定通道，团队记录安装版本 | 真机调试、编译、预览和上传；项目内不依赖 beta/nightly |
| Git | `>=2.44` | 分支、提交、Hooks 与 CI checkout |

Node 24 是当前 LTS，Node 官方建议生产使用 LTS 分支；Supabase CLI 的 Node.js 安装方式要求 Node 20 或更高。[Node.js Releases](https://nodejs.org/en/about/previous-releases) [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

### 安装/验证命令

```bash
node --version
npm --version
corepack enable
pnpm --version
docker version
pnpm exec supabase --help
```

验收：Node 主版本为 24，Docker Client 与 Server 均有输出，`pnpm exec supabase --help` 成功且 CLI 版本满足约束。

## 4. Supabase 初始化流程（执行时）

### 4.1 人工权限步骤

1. 在 Supabase Dashboard 分别创建 `nordic-nutri-dev` 与 `nordic-nutri-prod` 两个项目，选择离主要用户最近且符合数据要求的同一区域。
2. 记录各项目的 project ref、URL 和 publishable key 到团队密码库；绝不粘贴到仓库或聊天记录。
3. 在 development/production 项目的 Edge Function Secrets 分别配置：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`OPENAI_API_KEY` 或 `DEEPSEEK_API_KEY`（二选一）、`AI_PROVIDER`。生产与开发必须使用不同密钥。
4. 创建私有 bucket `food-images`，限制 JPEG/WebP、单文件 5MB；远端 migration 发布前不得开放 public bucket。

### 4.2 本地初始化命令

```bash
# 在仓库根目录；先确认 CLI 的实际命令与参数
pnpm exec supabase --help
pnpm exec supabase init --help

# Supabase CLI 已由根 devDependency 提供后执行
pnpm exec supabase init
pnpm exec supabase start
pnpm exec supabase status

# 创建 migration 必须先使用 CLI，不手工伪造时间戳文件名
pnpm exec supabase migration new init_schema
pnpm exec supabase migration list --local
```

`supabase init` 在根目录创建可提交的 `supabase/`，`supabase start` 用 Docker 启动本地服务；首次启动会下载镜像。执行人员从 `supabase status` 读取本地 URL 和 publishable key，写入本机 `.env.local`，不得复制生产值。[Supabase Local Development](https://supabase.com/docs/guides/local-development/cli/getting-started)

### 4.3 配置与 migration 规则

- `.env.example` 仅列：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`APP_ENV`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`AI_PROVIDER`、`OPENAI_API_KEY`、`DEEPSEEK_API_KEY`；值留空。
- `mini-program/.env.local`、`supabase/functions/.env`、根 `.env.local` 一律 ignore；生产 secret 只经 Dashboard 或 `supabase secrets set --env-file <outside-repo-file>` 管理。
- migration 按创建顺序：extensions/private schema → 表与约束 → FK/查询索引 → 更新时间触发器 → RLS/GRANT → Storage 策略 → 食品种子。一个 migration 只做一个可审阅主题。
- 远端发布前运行 `pnpm exec supabase db advisors --help` 确认可用，再运行相应 advisor；新表没有自动暴露到 Data API 的现状需在发布清单中显式检查，暴露后仍必须 RLS。

## 5. 微信小程序初始化方案（执行时）

### 5.1 创建与 TypeScript 配置

1. 在微信开发者工具中创建“微信小程序 / 不使用云开发 / TypeScript”项目，根目录选择 `mini-program/`；AppID 使用个人开发测试 AppID 或团队密码库中的开发 AppID，不提交到 Git。
2. 在 `mini-program/project.config.json` 关闭不必要的自动上传与本地私密路径；在 `project.private.config.json` 保存仅本机的 AppID/IDE 偏好并加入 `.gitignore`。
3. 在 `mini-program/src/types/` 放小程序全局类型声明；`tsconfig.json` 开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`，目标与微信工具兼容，不复用 Node 服务端 tsconfig。
4. 建立 `api/supabase-client.ts` 的接口边界与微信 storage adapter 的空实现契约；尚不调用 Auth、Storage、Function，也不写登录页面逻辑。
5. 建立 `components/loading`、`components/error-state`、`components/empty-state` 三个无业务数据依赖的基础组件，所有未来页面复用它们。

### 5.2 网络与环境边界

- `api/` 是唯一允许创建 Supabase client、拼接 Function URL、设置超时与映射 HTTP 错误码的目录。
- `services/` 不读取环境变量，`pages/` 不直接调用 `wx.request` 或 Supabase SDK。
- 构建时仅注入 `APP_ENV`、`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`；它们是公开配置，但发布前仍核对目标环境，禁止注入 secret key。
- 使用 `config/env.local.ts`、`env.development.ts`、`env.production.ts` 的同名导出形状；真实本地值由 ignored 文件覆盖，提交的文件只放 schema/占位符。

## 6. Git 规范

### 6.1 分支策略

| 分支 | 用途 | 合并规则 |
| --- | --- | --- |
| `main` | 与生产一致、可发布 | 仅由 PR 合入；必须通过 CI、迁移/RLS 审查 |
| `develop` | 开发环境集成分支 | 功能 PR 的默认目标；部署到 development Supabase |
| `feature/<scope>-<short-name>` | 单一用户可见能力 | 例如 `feature/onboarding-shell`；从 develop 创建，完成即删除 |
| `chore/<short-name>` | 工具、依赖、文档、CI | 不夹带业务行为变更 |
| `fix/<short-name>` | 已验证缺陷修复 | 必须附复现或回归测试证据 |
| `hotfix/<short-name>` | 生产紧急修复 | 从 main 创建，合入 main 后回合 develop |

### 6.2 提交规范

采用 Conventional Commits：`type(scope): summary`，英文小写动词开头、首行不超过 72 字符。允许类型 `feat`、`fix`、`chore`、`docs`、`test`、`refactor`、`ci`、`security`。

示例：`chore(repo): initialize pnpm workspace`、`docs(architecture): add supabase setup runbook`、`security(db): add owner-only rls policies`。

禁止：在一个提交中混入格式化、依赖升级、迁移和未相关页面变更；不得提交 `.env`、密钥、真机截图或本地数据库卷。每个 migration 需独立提交并在 PR 描述中列出回滚/前向修复方案。

## 7. 环境设计

| 环境 | Supabase | 小程序配置 | 用途与数据规则 |
| --- | --- | --- | --- |
| local | `supabase start` Docker 栈 | `APP_ENV=local`，localhost URL/本地 publishable key | 个人开发、迁移与 RLS 测试；仅假数据，可随时 reset |
| development | 独立云项目 `nordic-nutri-dev` | `APP_ENV=development`，dev URL/key | 集成测试、真机联调、测试微信 AppID；仅合成/测试账号 |
| production | 独立云项目 `nordic-nutri-prod` | `APP_ENV=production`，prod URL/key | 正式用户数据；仅 main 的受审部署可触达 |

- `development` 与 `production` 不共享数据库、Storage、Auth 用户、AI Key 或微信 AppSecret。
- 所有环境采用同一 migration 序列；发布顺序 local → development → production。禁止用生产库 `db pull` 覆盖本地开发迁移。
- 小程序环境映射以构建配置决定；预览包只能指向 development，正式发布包才可指向 production。

## 8. 第一阶段开发任务拆分

### Task 1：项目初始化

**输入**：现有 `docs/superpowers/specs/` 两份规格；空工作区；本实施方案。

**输出**：Git 仓库、pnpm workspace、根脚本、目录、`.gitignore`、README、CONTRIBUTING、Node/pnpm 锁定文件；保留原有 docs。

**文件**：创建根 `package.json`、`pnpm-workspace.yaml`、`.nvmrc`、`.gitignore`、`README.md`、`CONTRIBUTING.md`、`mini-program/` 目录；不修改 PRD/技术设计。

- [ ] 运行 `git init`，将默认分支设置为 `main`，创建 `develop`。
- [ ] 创建上述目录与根配置；在 `package.json` 固定 `packageManager`、Node engines、Supabase CLI 和 TypeScript 工具依赖。
- [ ] 运行 `corepack enable && pnpm install --frozen-lockfile=false`，生成并提交唯一的 `pnpm-lock.yaml`。
- [ ] 验证 `git status --ignored` 不显示真实 `.env` 为可跟踪文件；验证 `pnpm --version` 与 `.nvmrc` 一致。
- [ ] 提交：`chore(repo): initialize monorepo workspace`。

**验收标准**：`pnpm install --frozen-lockfile` 在干净副本成功；根目录仅有一个 lockfile；`docs/` 两份现有文档存在；无 secret 被 Git 跟踪。

### Task 2：Supabase 连接

**输入**：Task 1 的本地工具链；Docker 已启动；已获 development 项目的 project ref（不写入仓库）。

**输出**：可启动的本地 Supabase 栈、可提交 `supabase/` 目录、环境样例、development 链接记录方式与健康检查脚本。

**文件**：创建 `supabase/config.toml`、`.env.example`、`scripts/check-supabase.sh`、`docs/runbooks/supabase-environments.md`；不创建业务 Function。

- [ ] 运行 `pnpm exec supabase init`，确认只生成可提交的 `supabase/` 配置。
- [ ] 运行 `pnpm exec supabase start` 与 `pnpm exec supabase status`，将本地 URL/key 仅写入 ignored `.env.local`。
- [ ] 运行 `pnpm exec supabase link --help` 后，使用团队密码库中的 development project ref 完成 link；不得将 ref 以外的机密输出写进日志或文档。
- [ ] 编写健康检查脚本：验证 Docker daemon、`supabase status`、本地 REST/Studio 可达；脚本不得打印 secret。
- [ ] 提交：`chore(supabase): add local development baseline`。

**验收标准**：`pnpm exec supabase status` 显示本地服务；`supabase/config.toml` 被跟踪；`.env.local` 被忽略；远端链接只发生在 development 项目。

### Task 3：微信登录基础设施

**输入**：Task 1/2；技术设计 V2.0 的微信 code→OTP 会话决策；开发微信 AppID 和 secret 已由负责人写入 Supabase Secrets。

**输出**：小程序 Supabase client 边界、微信 storage adapter、Function 目录骨架、登录流程接口契约、无密钥的测试桩与运行手册；不实现微信交换业务。

**文件**：创建 `mini-program/src/api/`、`mini-program/src/config/`、`mini-program/src/types/auth.ts`、`supabase/functions/wechat-login/README.md`、`supabase/functions/_shared/README.md`、`docs/runbooks/wechat-auth.md`。

- [ ] 定义 `SessionStorage`、`AuthGateway`、`WechatLoginResponse` TypeScript 类型；只包含 interface 与错误码，不包含网络调用实现。
- [ ] 在小程序建立创建 Supabase client 的唯一入口，读取 publishable 配置；禁止 import/引用 secret key。
- [ ] 建立 `wechat-login` Function 的 README，固定输入 `code`、一次性 `token_hash` 输出、429/502 错误码、日志脱敏规则与 Secrets 名称。
- [ ] 编写契约测试：断言客户端环境配置不包含 `service_role`、`WECHAT_APP_SECRET`、`OPENAI_API_KEY`、`DEEPSEEK_API_KEY`。
- [ ] 提交：`chore(auth): add wechat login integration boundary`。

**验收标准**：仓库搜索不到真实 secret 或 `service_role` 值；登录骨架没有调用微信/远端 Auth；文档与 V2.0 的 code→OTP 会话一致。

### Task 4：数据库 Migration 基线

**输入**：技术设计 V2.0 数据表、RLS、Storage 方案；本地 Supabase 栈。

**输出**：可重复应用的初始 schema migration、RLS/Storage 策略测试、食品种子空模板；无产品业务数据与真实用户。

**文件**：由 `pnpm exec supabase migration new init_schema` 创建的 migration；创建 `supabase/seed/food_catalog.example.csv`、`supabase/tests/rls/README.md`、`docs/runbooks/migrations.md`。

- [ ] 先为 migration 建立表/约束/RLS/Storage 策略清单，逐项与 V2.0 的 users、profiles、user_goals、body_profiles、nutrition_plans、meal_records、meal_items、food_catalog、ai_analysis、coach_messages 对照。
- [ ] 在本地数据库迭代 migration SQL，所有 public 表启用 RLS，策略用 `(select auth.uid())` 与所有权列；所有外键与 RLS 筛选列建立索引。
- [ ] 为 `food-images` 创建私有 bucket 和仅限首级目录所属用户的 Storage 策略；禁止客户端 upsert。
- [ ] 创建两个本地测试身份，验证 A 不能读取/修改/删除 B 的资料、餐次、分析和 Storage 对象；验证 A 自己的 CRUD 能通过。
- [ ] 运行 `pnpm exec supabase db advisors --help` 后执行可用的 advisor 命令，解决安全/性能告警；运行 `pnpm exec supabase migration list --local`。
- [ ] 提交：`security(db): add initial schema and owner rls`。

**验收标准**：空库可从 migration 重建；所有目标表和 bucket 私有策略存在；RLS 测试包含允许与拒绝两类断言；不出现 client 可写 `user_id` 到他人行的策略漏洞。

### Task 5：Onboarding 页面壳

**输入**：Task 1 的原生小程序目录、PRD 目标/身体资料/计划流程、Task 3 类型边界。

**输出**：Onboarding、Body Profile、Nutrition Plan 三个可导航页面壳、纯本地表单草稿、基础 Loading/Error/Empty UI；不保存资料、不计算计划、不调用 Supabase。

**文件**：创建 `mini-program/src/pages/onboarding/`、`body-profile/`、`nutrition-plan/`，及 `components/loading/`、`error-state/`、`empty-state/`、`stores/onboarding-draft.ts`、对应页面测试。

- [ ] 先写表单状态测试：在三页之间前进/返回后草稿保留；非法年龄、身高、体重和训练频率不可进入下一步。
- [ ] 仅实现本地状态、输入校验和路由跳转；不创建 `generate-plan` 调用、不写数据库、不接入登录。
- [ ] 在微信开发者工具编译，验证三个空页面路由、错误态/加载态组件和无障碍标签显示。
- [ ] 提交：`feat(onboarding): add local onboarding page shells`。

**验收标准**：首次流程可离线走通并保留草稿；没有任何网络请求；所有字段范围与 PRD 一致；页面不含营养计算或 Auth 业务代码。

### Task 6：Home Dashboard 页面壳

**输入**：PRD 首页展示定义、Task 5 基础组件与环境边界。

**输出**：Dashboard 静态布局、类型化展示 DTO、加载/空/错误态、AI Scan 与 Record Meal 路由占位；不读取真实营养数据、不实现 AI 或餐次保存。

**文件**：创建 `mini-program/src/pages/home/`、`components/macro-progress/`、`components/meal-card/`、`types/dashboard.ts`、`stores/daily-nutrition.ts`、页面快照/交互测试。

- [ ] 先写组件测试：0、目标内、超标三种营养显示不会产生负环或 NaN；空餐次显示行动入口。
- [ ] 只使用 fixture DTO 渲染目标卡、三大营养素、NOVA 占位卡和餐次列表；fixture 必须为合成数据且不含用户资料。
- [ ] 验证 loading、empty、error 三态在微信开发者工具与单元测试中可见；按钮只导航到空白占位路由。
- [ ] 提交：`feat(home): add dashboard presentation shell`。

**验收标准**：Dashboard 在无网络时可用 fixture 渲染；无 Supabase/AI 请求；组件能处理边界数值；页面结构与 PRD 首页信息架构一致。

## 9. 开发注意事项

### 安全与密钥

- 永不在小程序、`project.config.json`、commit、CI 日志或截图中出现 secret/service role/AI/微信 AppSecret；仅 publishable key 可被构建注入。
- `supabase/functions/.env` 与任何 `.env.local` 必须被 ignore；远端使用 Supabase Secrets。Edge Functions 的 secret key 可绕过 RLS，不能进入公开客户端。[Supabase Function Secrets](https://supabase.com/docs/guides/functions/secrets)
- 真实用户图片、OpenID、会话 token 不能进入 fixtures、seed、错误报告或分析日志。

### RLS 验证

- 每张新 public 表同时提交：表、最小 GRANT、RLS enable、SELECT/INSERT/UPDATE/DELETE policy、RLS 测试、查询索引。
- UPDATE 策略同时含 `USING` 和 `WITH CHECK`；UPDATE 还需可用的 SELECT policy。`TO authenticated` 不等于行级授权，仍需所有权谓词。
- 通过 user A/user B 自动测试验证正例与反例；只在 Dashboard 查看“启用 RLS”不构成验收。

### 错误与日志

- 小程序错误统一映射为稳定业务码：`NETWORK_UNAVAILABLE`、`SESSION_EXPIRED`、`VALIDATION_FAILED`、`RATE_LIMITED`、`SERVICE_UNAVAILABLE`、`UNEXPECTED`；UI 不展示原始堆栈。
- 每个 Function 与客户端请求产生 `request_id`；日志记录时间、环境、版本、匿名 user ID hash、操作、状态和耗时，不记 secret、Authorization、OpenID、图片 URL、完整模型提示。
- 网络写操作使用幂等键；超时只重试明确可重试的 GET 或具幂等键的请求。失败保留本地草稿，不自行重放非幂等写。

## 10. Alternatives

- **ALT-001：多仓库（小程序和 Supabase 分开）**：不采用。初期变更常跨页面、Function、migration 和文档，单仓库更利于原子 PR 与同步版本。
- **ALT-002：全局安装 Supabase CLI**：不采用。团队成员与 CI 可能使用不同版本；本地 devDependency 才能锁定行为。
- **ALT-003：开发/生产共用一个 Supabase 项目**：不采用。会将真机测试、迁移试错、Storage 图片和用户数据置于同一风险域。
- **ALT-004：初始化时直接开发微信登录与业务表**：不采用。该阶段先建立可验证的边界；业务能力由后续 feature plan 和 TDD 实施。

## 11. Dependencies

- **DEP-001**：Supabase 团队组织权限与 development/production 项目创建权限。
- **DEP-002**：微信小程序 AppID、服务器域名白名单与 `code2Session` 资质。
- **DEP-003**：Docker Desktop 可用；本地端口未被 54321–54324 占用。
- **DEP-004**：AI Provider 的正式账号、区域可用性、数据处理条款与密钥轮换流程。
- **DEP-005**：团队密码管理器与 CI Secret Store，用于保存所有真实配置。

## 12. Files

- **FILE-001**：`package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` — 根依赖与可重复工具版本。
- **FILE-002**：`mini-program/src/` — 原生小程序页面/组件/API 边界。
- **FILE-003**：`supabase/config.toml`、`supabase/migrations/`、`supabase/functions/` — 本地栈、数据库演进和服务端边界。
- **FILE-004**：`.env.example`、`.gitignore` — 配置契约和密钥防泄露。
- **FILE-005**：`docs/runbooks/`、`CONTRIBUTING.md` — 环境、迁移、分支与操作规范。

## 13. Testing

- **TEST-001**：干净 checkout 执行 `pnpm install --frozen-lockfile` 成功。
- **TEST-002**：Docker 就绪时 `pnpm exec supabase start`、`status` 和本地 Studio/REST 可达。
- **TEST-003**：环境扫描确认 tracked files 不含 `.env`、secret key、OpenID 或测试图片。
- **TEST-004**：本地 RLS 双身份测试覆盖用户表、餐次、分析和 Storage 的允许/拒绝路径。
- **TEST-005**：小程序页面壳在开发者工具可编译；Onboarding 草稿校验与 Dashboard 三类边界 DTO 测试通过。

## 14. Risks & Assumptions

- **RISK-001**：微信开发者工具的本地网络与 localhost 访问受限。缓解：development 环境使用独立云项目并仅使用测试数据；记录真机域名配置流程。
- **RISK-002**：Supabase CLI/平台变更。缓解：CLI 固定在仓库、每次升级先在 local 验证；2026 年平台已提示新表不会自动暴露到 Data API，迁移发布清单必须检查暴露与 RLS。[Supabase Changelog](https://supabase.com/changelog)
- **RISK-003**：错误的 RLS 可导致 BOLA/IDOR。缓解：迁移即写双身份反向测试，未通过不得发布。
- **RISK-004**：AI 或微信密钥误入客户端。缓解：预提交密钥扫描、`.env.example` 审查、CI secrets 使用最小权限。
- **ASSUMPTION-001**：开发团队有 Supabase Dashboard 与微信小程序后台的适当权限。
- **ASSUMPTION-002**：一期不需要共享 package；后续若出现稳定的共享 DTO，再创建独立 ADR 和迁移计划。

## 15. Related Specifications / Further Reading

- [PRD V1.0](../specs/2026-07-10-nordic-nutri-ai-prd-v1.md)
- [技术设计文档 V2.0](../specs/2026-07-10-nordic-nutri-ai-technical-design-v2.md)
- [Supabase Local Development](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
