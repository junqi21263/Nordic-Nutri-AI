# Nordic Nutri AI — Task 10.2 全局 UI Calibration 验收表

视觉唯一基准为用户提供的 Stitch 画板与 Home 页面设计令牌。本轮只修改 Taro 小程序 `src` 内的视觉层、公共布局和样式；未修改 Store、fixture、路由语义、网络边界或 Supabase。

## Token 校准对照

| 语义 | 校准前 | 校准后（Stitch） | 使用规则 |
| --- | --- | --- | --- |
| Primary / Forest Green | `#2d4b37` | `#163422` | 主按钮、激活状态、关键数值 |
| Primary Container | 未单独定义 | `#2d4b37` | 深色容器与层级背景 |
| Dark Forest | `#173d2a` | `#0c1f14` | 深色视觉区域，不作为正文色 |
| Sage | 近似绿 | `#b5ccba` | 轻提示、进度和选中辅助色 |
| Background | `#faf9f6` | `#faf9f6` | 全局暖白背景 |
| Text Primary | 近黑 | `#1a1c1a` | 标题与主要内容 |
| Text Secondary | 近似灰 | `#424843` | 描述、辅助信息 |
| Divider | 未统一 | `#c2c8c0` | 卡片、输入、列表分割 |
| Disabled | 透明度覆盖 | `#e3e3df` + `#727972` | 可读的禁用底色与文字 |

## 排版与组件规则

- 字体统一为 `PingFang SC` 优先的系统无衬线栈；Display、页面标题、分区标题、卡片标题、正文、说明、按钮和数字均有语义 Token。
- 组件标题与数值统一最大使用 `600` 字重，移除 `700/750/800` 的分散定义，避免微信端中文显得厚重。
- `AppButton`、`AppCard`、`MacroProgress`、`NutritionCard`、`MealCard`、`AIInsightCard`、`ListItem`、`StatisticCard`、`BottomTabBar`、状态组件、Modal/BottomSheet 均使用同一套色彩、圆角、阴影、间距和动效 Token。
- `ProgressFallback` 未移除；`conic-gradient` 不可用时仍有数值和条形进度作为降级显示。
- 以 `data-reduced-motion="true"` 为预留入口关闭过渡与动画；不引入浏览器专属媒体查询。

## 页面视觉 QA

| 页面 | 本轮校准内容 | 微信开发者工具状态 |
| --- | --- | --- |
| Onboarding | 动态胶囊 Header、纵向卡片、轻选中描边、紧凑固定底部操作 | 待按下述机型目测 |
| Body Profile | 分步 Header、表单字段、Chip、按钮尺寸与安全区 | 待目测 |
| Nutrition Plan | 深色计划卡、数字层级、宏量卡、双操作 | 待目测 |
| Home | 目标卡、进度、洞察、餐次、底部导航与 FAB | 待目测 |
| Food Scanner | 安全区、取景框、控制区和快门操作 | 待目测 |
| Analysis Result | 主视觉、分数、营养、食材和底部操作 | 待目测 |
| Portion Adjustment | 份量控件、数值、营养摘要与底部操作 | 待目测 |
| Meal Records | 日期、汇总、搜索/筛选、分组列表与 Tab | 待目测 |
| Meal Detail | 图片、营养、食材、洞察和操作区 | 待目测 |
| Coach | 洞察、指标、建议与底部输入区 | 待目测 |
| Profile | 头像、统计、成就、设置列表与 Tab | 待目测 |

## 微信开发者工具目测步骤

1. 导入 `mini-program/dist/weapp`，选择 iPhone SE、iPhone 12/13、iPhone 15 Pro 与约 360px Android 模拟器。
2. 从 Onboarding 开始，检查胶囊不遮挡 Header、四张卡高度一致、底部按钮不遮挡最后一张卡，且无横向滚动。
3. 依次进入其余十页，检查暖白背景、轻边框卡片、600 字重标题、底部 Tab/操作区和长页滚动。
4. 在低基础库或模拟禁用环形渐变的场景，确认 `ProgressFallback` 仍显示进度和值。
5. 控制台应没有 WXSS 编译错误；运行时 API 警告须以微信开发者工具实际版本为准。
