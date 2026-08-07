# Stitch Achievement Unlock Animation Spec

## 状态与来源

- Golden Reference：`/Users/lewis/Downloads/stitch_nordic_nutri/code.html`
- 辅助视觉参考：`/Users/lewis/Desktop/录屏2026-08-07 18.56.50.mov`
- 参考画布：390 × 884（Stitch 预览）
- 本文件优先记录 Stitch 源码可直接读取的值；无法从源码确定的结果明确标为“由布局推导”。

## 页面结构与层级

1. 背景模拟应用：`z` 默认层。
2. 遮罩：`#overlay`，`z-40`。
3. 居中容器与成就卡片：遮罩内部。
4. 礼花容器：`#confetti-container`，`z-50`，覆盖卡片内外与整屏。

## 静态视觉参数

| 项目 | Stitch 源码真实值 | 说明 |
| --- | --- | --- |
| 遮罩背景 | `bg-black/40` | 黑色 40% 透明度 |
| 背景模糊 | `backdrop-blur-md` | Tailwind 默认 `blur(12px)` |
| 遮罩过渡 | `transition-opacity duration-300` | HTML 未提供从 0 到 1 的状态切换代码；不可将其臆测为已运行的关键帧 |
| 卡片位置 | `absolute inset-0 flex items-center justify-center p-margin-mobile` | 视口居中，四周 20px 留白 |
| 卡片宽度 | `w-full max-w-md` | 390px 画布中宽 350px；最大 448px |
| 卡片背景 | `#faf9f4` | `surface` |
| 卡片圆角 | 24px | `rounded-[24px]` |
| 卡片阴影 | Tailwind `shadow-2xl` | 默认约 `0 25px 50px -12px rgb(0 0 0 / 0.25)` |
| 卡片内边距 | 24px | `p-6` |
| 关闭按钮 | top/right 16px，内边距 8px，图标 20px | 视觉尺寸约 36px |
| 内容起始 | `mt-2` | 卡片内向下 8px |
| Icon 容器 | 80 × 80px、圆形 | `bg-secondary-container #cee6c8` |
| Icon | Material `restaurant`，32px，`FILL=1` | 深绿 `primary #002413` |
| Icon glow | 30px/10% → 50px/25% 深绿光晕 | `pulseGlow 2s infinite alternate` |
| Sparkle | 20px（右上偏移 -8/-8）、18px（左下偏移 -4/-8） | `auto_awesome`，`#a1d2b1`，`animate-pulse` |
| 解锁标签 | 12px / 16px / 600 / `0.05em` | 原文：`🎉 已解锁成就` |
| 成就标题 | 28px / 34px / 600 | 原文：`第一餐记录` |
| 说明文案 | 16px / 24px / 400，最大宽 260px | 原文：`成功记录第一餐，开启你的营养记录旅程。` |
| 文本分组间距 | 8px | `space-y-2` |
| 进度模块 | 上边距 24px | 标签 12px，数值 14px / 20px / 500 |
| 进度条 | 高 8px，轨道 `#e3e3de`，圆角全满 | 填充 `#a1d2b1` |
| 主/次 CTA 组 | 上边距 32px，按钮间距 8px | 两个完整按钮 |
| CTA 高度 | `py-3` + 20px 行高 | 约 44px |
| CTA 圆角 | 12px | 主按钮 `#002413`；次按钮透明、1px `#c1c9c0` 边框 |

## 文案与进度

```text
🎉 已解锁成就
第一餐记录
成功记录第一餐，开启你的营养记录旅程。

进度                         1 / 20
继续记录
查看成就
```

进度条初始宽度为 `0%`；`T=1500ms` 写为 `5%`，使用 `transition-all duration-1000 ease-out`。

## 时间线（以 DOMContentLoaded 为 T=0）

| 时间 | Stitch 源码行为 |
| --- | --- |
| 0ms | 遮罩已在 HTML 中存在；卡片因 `animate-pop` 初始 `opacity: 0`、`translateY(20px) scale(0.9)` 不可见 |
| 150ms | 卡片仍未开始；未生成礼花 |
| 300ms | 同时调用 `createConfettiBurst('left')` 与 `createConfettiBurst('right')` |
| 500ms | 卡片开始 `popCard`，持续 600ms |
| 750ms | 卡片处于 pop 中段；文本仍为 0 透明度 |
| 1000ms | 卡片接近 pop 结束；文本仍未开始淡入 |
| 1200ms | 文本组开始 `fadeIn 500ms ease-out` |
| 1250ms | 文本淡入中；进度/按钮尚未开始 |
| 1300ms | 进度模块开始 `fadeIn 500ms ease-out` |
| 1400ms | 两个 CTA 开始 `fadeIn 500ms ease-out` |
| 1500ms | 进度条宽度写为 5%，开始 1000ms ease-out 过渡 |
| 2000ms | 文本、进度、CTA 均完成淡入；进度条仍在过渡；粒子按物理状态继续 |
| 2500ms | 进度条到 5%；剩余粒子由其是否到达底部决定 |
| 3000ms | 粒子可能仍存在；没有固定寿命，满足“到底部后淡出或越界”才移除 |

### 卡片关键帧

```css
animation: popCard 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
animation-delay: 500ms;

0%   { opacity: 0; transform: translateY(20px) scale(0.9); }
70%  { opacity: 1; transform: translateY(0) scale(1.02); }
100% { opacity: 1; transform: translateY(0) scale(1); }
```

## 粒子真实参数

| 项目 | Stitch 源码真实值 |
| --- | --- |
| 总数量 | 80：左 40 + 右 40 |
| 生成时间 | T=300ms，两边同一帧生成 |
| 容器 | `absolute inset-0`、`pointer-events-none`、`z-50`；不受卡片裁切 |
| 调色板 | `#0B3B24`、`#bdeecc`、`#e3e3de`、`#F9F8F3` |
| 黄色/橙色 | 不存在 |
| 圆形概率 | 50%：`Math.random() > 0.5` |
| 尺寸 | 随机 4–12px |
| 圆形 | 宽高相等，`border-radius: 50%` |
| 非圆形 | 宽 4–12px、高为宽的 1.5 倍、基础圆角 2px；右上和左下圆角设为 50%，形成叶片感 |
| 起点 X | 左 `-20px`；右 `window.innerWidth + 20px` |
| 起点 Y | `window.innerHeight / 2 ± 100px` |
| 左侧角度 | -30° 至 +30° |
| 右侧角度 | 150° 至 210° |
| 初速度 | 10–25 px/frame |
| 初始 vx | `cos(angle) * velocity` |
| 初始 vy | `sin(angle) * velocity - 10` |
| 阻尼 | 每帧 `vx *= 0.95` |
| 重力 | 每帧 `vy += 0.5` |
| 初始旋转 | 0–360° |
| 旋转速度 | -10 至 +10°/frame |
| 淡出 | `y > height - 100` 时，每帧 `opacity -= 0.05` |
| 结束条件 | `opacity <= 0` 或 `y >= height + 50`，移除节点 |
| 帧驱动 | `requestAnimationFrame` |

### 关键结论

Stitch 源码没有“碰撞后释放另一批粒子”的逻辑，也没有固定 CSS 轨迹。它是两束独立的弹道粒子：从左右边缘射入、受 0.95 阻尼与 0.5 重力影响、自然越过和交错。后续实现必须复刻这一物理模型，而不是把每颗粒子锚定到中点或用多段静态关键帧模拟碰撞。

