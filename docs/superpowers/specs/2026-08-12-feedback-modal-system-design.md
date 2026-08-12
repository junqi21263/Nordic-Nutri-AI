# Nordic Nutri AI 全局 Feedback Modal System

## 范围与约束

- 新增一套全局可复用的 Feedback Modal，支持 `success`、`limit`、`error` 三种状态。
- 复用现有 `useFeedbackStore` 与 `FeedbackHost`，不新增第二套全局 Provider。
- Modal 使用固定 Overlay，脱离页面滚动布局，不推动内容、不改变 scrollTop、不影响 fixed footer。
- 有 Feedback Modal 的流程不显示 Toast；未接入 Modal 的短提示继续使用原 Toast。
- 当前已验收页面的静态布局、按钮、卡片、间距不做改动。

## Stitch → Taro 映射

| Stitch Web | 小程序实现 |
| --- | --- |
| `.modal-backdrop` fixed inset overlay | `FeedbackHost` 中的固定 Overlay |
| 40% inverse surface + 4px blur | 半透明深色遮罩；按小程序能力使用兼容的背景效果 |
| `calc(100% - 40px)`、max-sm、24px radius、48px padding | FeedbackModal 统一 geometry，使用项目 spacing/token |
| success 340ms spring：0.96 → 1.015 → 1 | success modal 入场动画 |
| check 延迟 150ms、draw 500ms | success ring/check 顺序动画 |
| limit 300ms ease-out，0.98 → 1 | limit 稳定淡入及一次轻 pulse |
| error 400ms ease-out + -3px/+3px | error 入场及一次轻微横向反馈，不做强烈 shake |
| overlay exit 300ms | 三种状态共用退出动画，完成后卸载 |

## 组件 API

```ts
type FeedbackModalVariant = "success" | "limit" | "error";

interface FeedbackModalOptions {
  variant: FeedbackModalVariant;
  title: string;
  description?: string;
  primaryText: string;
  secondaryText?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onClose?: () => void;
  dismissible?: boolean;
}
```

`FeedbackStore` 增加 `modal`、`showModal`、`closeModal`。`showModal` 会清理当前 toast，保证同一时刻不会出现 Toast + Modal 双层反馈。

## 业务接入

1. 当前方向：成功使用 success，保存失败使用 error。
2. 个人资料：保存成功使用 success，保存失败使用 error。
3. 反馈 Bottom Sheet：提交成功先关闭 Sheet，等待退出后显示 success；失败显示 error 并保留输入内容。
4. 食物 AI 识别：明确的每日上限错误映射为 limit，其他请求异常映射为 error。
5. AI 营养教练：明确的每日上限错误映射为 limit，网络/API/服务异常映射为 error。

## 行为与文案

- success 默认只显示 primary CTA“知道了”，不显示彩带、粒子或 Achievement 庆祝效果。
- limit 使用低饱和琥珀/奶油视觉，不使用红色，不自动点击遮罩关闭。
- error 使用 muted brick red；允许“重新尝试”和“稍后再试/知道了”双按钮；不自动点击遮罩关闭。
- success 是否允许关闭由 `dismissible` 决定；默认通过 primary CTA 关闭。
- Modal 业务文案由调用方提供，组件内部不写死业务文本。

## 测试与验收

- Store 单元测试：showModal 清 Toast、closeModal、variant/options 保留。
- 组件/契约测试：三种 variant 共用结构、Modal 为 fixed overlay、无页面布局插入。
- 业务测试：反馈成功先关闭 Sheet 后显示 Modal；失败保留输入；limit 与 error 分流。
- 运行 mini-program 单元测试、typecheck、lint、build:weapp、verify:weapp。
