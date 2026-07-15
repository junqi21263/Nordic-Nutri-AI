# Taro React Foundation Implementation Plan

> **For agentic workers:** Execute inline task-by-task; do not modify `supabase/`.

**Goal:** 将 `mini-program/` 从原生小程序骨架重构为可构建的 Taro + React + TypeScript 微信小程序工程，只提供视觉组件、页面壳、状态与 API 边界。

**Architecture:** Taro 默认输出 `weapp`，同时保留 H5 配置。页面只消费 fixture 数据和展示组件；Zustand 只保存本地初始状态，TanStack Query 仅创建全局客户端。Supabase 继续位于现有后端边界之外，客户端仅持有可注入的公开配置与接口类型。

**Tech Stack:** Taro React、React、TypeScript、Zustand、TanStack Query、Sass、ESLint、Prettier、pnpm。

---

### Task 1: 前端工具链与安全基线

**Files:** `mini-program/package.json`、`mini-program/config/*`、`mini-program/tsconfig.json`、`.env.example`、`.gitignore`、`scripts/verify-taro-foundation.mjs`。

- [x] 写入结构与 secret 扫描测试，并运行确认它因 Taro 工程尚不存在而失败。
- [x] 安装锁定的 Taro/React/状态、质量与 Sass 依赖；创建 weapp/H5 构建、类型检查、lint、format 脚本。
- [x] 配置环境变量仅使用 `TARO_APP_*` 公开变量；更新示例与忽略规则。
- [x] 运行依赖安装与结构测试。

### Task 2: 设计系统、基础设施与状态边界

**Files:** `mini-program/src/styles/*`、`src/app.*`、`src/api/*`、`src/services/*`、`src/stores/*`、`src/types/*`。

- [x] 先扩展静态测试，要求 tokens、QueryClient、五个 Store 和无特权 key 的 Supabase 边界。
- [x] 实现 Nordic 色彩、排版、阴影、间距与安全区 tokens；创建 QueryClient、错误映射、公开配置与可注入客户端接口。
- [x] 实现只含初始状态、setter、reset 的 Zustand Store。
- [x] 运行类型检查和静态测试。

### Task 3: 通用组件与页面骨架

**Files:** `mini-program/src/components/*`、`mini-program/src/pages/*`、`src/app.config.ts`。

- [x] 先扩展静态测试，要求 11 个组件与 11 个路由页面存在，且页面不导入 Supabase/AI/上传模块。
- [x] 实现展示型组件与统一 Token 样式；实现仅含 fixture、Loading/Empty/Error 入口的页面。
- [x] 配置 tabBar、页面路由、分包预留与微信项目文件。
- [x] 运行类型检查、lint、结构与 secret 测试。

### Task 4: 构建、文档与边界验证

**Files:** `README.md`、`mini-program/README.md`、`docs/adr/0001-use-taro-react.md`、`docs/superpowers/specs/2026-07-10-nordic-nutri-ai-technical-design-v2.md`。

- [x] 更新技术栈、目录职责、Taro 构建与微信开发者工具导入文档。
- [x] 执行 `build:weapp`、类型检查、lint、结构检查与 secret 扫描。
- [x] 使用 Git 路径检查确认本次未改动 `supabase/`。
