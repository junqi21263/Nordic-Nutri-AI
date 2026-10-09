# Android 登录入口图标替换设计

## 目标

将 Android 登录入口页的 Google、邮箱、手机号入口替换为清晰、语义匹配的本地图标，保持现有按钮尺寸、文字、交互和布局不变。

## 视觉方案

- Google：使用本地 SVG 的官方四色 G 标识。
- 邮箱：使用深绿色线性信封图标。
- 手机：使用深绿色线性手机图标。
- 三个图标统一通过现有 `NordicIcon` 组件渲染，尺寸由入口页控制，避免 Emoji、字体图标和外部网络资源造成设备差异。

## 实现范围

1. 在 `mini-program/src/assets/icons/` 增加 Google、邮箱、手机三个 SVG 资源。
2. 在 `mini-program/src/components/nordic-icon/index.tsx` 注册三个图标名称和资源映射。
3. 在 `mini-program/src/pages/android-auth/index.tsx` 替换登录入口页当前的 Google 字母和 CSS 绘制图标。
4. 删除仅服务于旧邮箱/手机 CSS 图标的样式；保留按钮和无障碍标签行为。

## 验证

- 增加静态回归检查，确认入口页使用三个 `NordicIcon` 名称，并且图标资源已注册。
- 运行 Android 登录相关测试、类型检查和 Android H5 构建。
- 不改变认证请求、路由状态、按钮文案及其他页面图标。
