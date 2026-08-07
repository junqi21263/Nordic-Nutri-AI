# Achievement Animation Diff: Stitch vs Current

## 结论

当前实现是“参考后的再设计”，不是 Stitch 参数移植。最严重差异是粒子引擎：Stitch 使用 `requestAnimationFrame` 的两侧弹道模型；当前实现使用 80 个 `View` 的多段 CSS 路径，因此首屏形成散点云，无法表现 Stitch 的左右喷射、阻尼和重力。

## 逐项差异

| 区域 | Stitch Golden Reference | 当前实现 | 状态 |
| --- | --- | --- | --- |
| Modal 宽度 | 390px 画布为 350px（两侧 20px） | `width: 88%`，约 343px；但 `max-width: 620px` | MINOR_DIFF（移动端接近，最大宽度不一致） |
| Modal 高度/内容 | 24px padding、完整进度与两个按钮，纵向更丰满 | 无进度条，次操作是文本，整体更紧凑 | MAJOR_DIFF |
| 卡片入场 | 500ms 延迟；20px/0.9 → 1.02 → 1，600ms | 500ms 延迟；50px/0.8 → 1.05 → 1，600ms | MAJOR_DIFF |
| 背景遮罩 | 黑色 40%，blur-md（约 12px） | 森林绿 38%，blur 3px | MAJOR_DIFF |
| 阴影 | `shadow-2xl` 黑色阴影 | 绿色 `0 22px 48px rgba(..., .22)` | MAJOR_DIFF |
| Icon 容器 | 80px、`#cee6c8`、无描边 | 104px、浅绿、2px 描边 | MAJOR_DIFF |
| Icon | 32px 填充 Material `restaurant` | 本地 `utensils.svg` 52px 描边图标 | MAJOR_DIFF；当前并非 iconfont，而是本地 SVG 图片，但视觉规格不同 |
| Sparkle | Material `auto_awesome` 20/18px，Tailwind pulse | 本地 SVG 20/18px，独立入场与 pulse | MINOR_DIFF |
| 解锁标签 | `🎉 已解锁成就`，12px | `成就已解锁`，当前字号更大 | MAJOR_DIFF |
| 成就标题 | 28/34/600 | 项目 `$font-h2` | MINOR_DIFF（需按实际 token 再测量） |
| 描述 | Golden 固定文案、260px max width | 后端 requirement 文案、460px max width | MAJOR_DIFF |
| 进度模块 | `进度 / 1 / 20` + 8px 圆角条，T=1500ms 变 5% | 完全缺失 | MISSING |
| 主 CTA | `继续记录`，完整按钮 | `收下这份成就` | MAJOR_DIFF |
| 次 CTA | `查看成就`，完整描边按钮 | `查看全部成就`，文本链接 | MAJOR_DIFF |
| 粒子数量 | 80（40 + 40） | 80（40 + 40） | MATCH（仅数量） |
| 粒子颜色 | 深绿/薄荷绿/浅灰白/米白 | 米白/浅绿/半透明白，另有金黄 `#d8a94b` | MAJOR_DIFF |
| 粒子形状 | 50% 圆形、50% 叶片圆角矩形，4–12px | fragment/leaf/spark/dot，多套固定长宽 | MAJOR_DIFF |
| 粒子起点 | 左右屏幕边缘，Y 为中部 ±100px | 左右边缘，Y 为 35–65% | MINOR_DIFF |
| 粒子运动 | rAF：vx 阻尼 0.95、vy 重力 +0.5、旋转、到底部淡出 | CSS 12%/36%/64%/100% 多段路径 | MAJOR_DIFF |
| 粒子生命周期 | 到底部后逐帧淡出或越界 | 固定 3.8–4.25 秒 | MAJOR_DIFF |
| 粒子层 | 全屏，z-50，覆盖卡片内外 | 全屏 z-3、卡片 z-2 | MATCH（层级目的） |
| 内容时间线 | 文本1200、进度1300、CTA1400、进度条1500 | 文本1150–1250、CTA1350/1450；无进度 | MAJOR_DIFF |

## Golden Frame 回归表

以 Stitch DOMContentLoaded 为 T=0。当前版本应在未来实现后针对相同时间点录制/截图；禁止只验收最终静态帧。

| 时间 | Stitch 期望状态 | 当前录屏已观测状态 | 状态 |
| --- | --- | --- | --- |
| 0ms | 遮罩存在；卡片不可见 | 未建立精确触发帧 | 待回归 |
| 150ms | 卡片不可见、尚未礼花 | 未建立精确触发帧 | 待回归 |
| 300ms | 左右各 40 粒子从边缘生成 | 当前首段快速形成满屏散点 | MAJOR_DIFF |
| 500ms | 卡片开始 20px/0.9 pop | 当前卡片从 50px/0.8 pop | MAJOR_DIFF |
| 750ms | 卡片 pop 中；文字未显现 | 当前粒子已覆盖卡片、出现空白卡片 | MAJOR_DIFF |
| 1000ms | 卡片接近完成；文字仍未显现 | 当前内容与粒子节奏不一致 | MAJOR_DIFF |
| 1250ms | 文本淡入中 | 当前文本分项淡入 | MINOR_DIFF |
| 1500ms | 文本/进度/CTA 淡入，进度条开始增长 | 无进度条 | MISSING |
| 2000ms | CTA 已完整；进度条仍在过渡；弹道粒子按物理状态存在 | 固定 CSS 轨迹粒子 | MAJOR_DIFF |
| 2500ms | 进度条到 5%，少量底部粒子淡出 | 无进度条 | MISSING |
| 3000ms | 仍可能有低位粒子；由物理条件结束 | 固定时长淡出 | MAJOR_DIFF |

## 后续修复边界（尚未实施）

1. 先按 Golden 静态规格恢复文案、进度、两个完整 CTA、Icon 尺寸和卡片布局。
2. 用 Canvas 2D 或可控 rAF 层移植 Stitch 的粒子函数：80 粒子、4 色、两种形状、起点、角度、速度、阻尼、重力、旋转和淡出条件必须取自 `STITCH_ANIMATION_SPEC.md`。
3. 仅在静态终帧与 T=0–3000ms Golden Frame 都通过后，再处理微信小程序平台渲染差异和性能。

## 平台限制预判

- 微信小程序不保证浏览器 `backdrop-filter` 与 Tailwind 浏览器预览的像素级一致；需使用同一遮罩颜色并以真机录屏测量。
- 浏览器 Material Symbols 的填充 `restaurant` 不能直接依赖小程序字体文件；需提供等比例、稳定的本地 SVG/图片资源，而不是 iconfont。
- 小程序 Canvas 2D/rAF 的帧率受设备影响；应保持同一物理常量，以时间步长归一化，而不是改成不同视觉轨迹。

