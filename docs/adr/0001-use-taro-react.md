# ADR-0001：采用 Taro + React 作为小程序前端基础

- 状态：Accepted
- 日期：2026-07-13

## 决策

Nordic Nutri AI 的前端从微信原生小程序 + TypeScript 切换为 Taro + React + TypeScript。默认交付目标仍是微信小程序，同时保留 H5 构建能力。

## 背景与理由

产品包含 AI Coach、营养卡片、扫描结果、长期记录和后续趋势图。React 组件、Hooks、Zustand 与 TanStack Query 能提高个人开发与 Codex 协作时的组件复用、状态组织和迭代速度。Stitch 的 HTML/CSS 设计也更容易映射为 JSX 组件树。

## 保留的后端边界

本决策不改变 Supabase Auth、PostgreSQL、Migration、RLS、Storage、Edge Functions 或现有 Auth trigger。客户端继续只使用 Publishable Key；service role、微信 AppSecret、AI Key 和数据库密码仍只允许存在于服务器侧或受控密钥系统。

## 风险与约束

- Taro 带来运行时与构建依赖，首包需要持续监控并通过分包、按页拆分和真机测试控制。
- 多端不是零成本：H5 可复用业务与组件结构，但导航、样式、文件、生命周期和平台 API 必须分别验证。
- 相机、Canvas 图表、Storage 上传、后续支付和系统能力必须经平台适配层接入；不应把微信原生 API 散落到页面中。
- 本期不引入大型 UI 库、图表库、Redux、AI SDK 或微信支付 SDK。
