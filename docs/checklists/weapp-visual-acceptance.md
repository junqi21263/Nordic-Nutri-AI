# Nordic Nutri AI 微信小程序视觉验收 Checklist

## 导入与基础配置

- [ ] 在微信开发者工具中导入 `mini-program/`；`project.config.json` 的 `miniprogramRoot` 已指向 `dist/weapp/`。
- [ ] 确认编译模式为小程序，启动页为 `pages/onboarding/index`。
- [ ] 确认已使用自定义导航栏：页面顶部没有额外的微信原生标题栏。
- [ ] 在 iPhone 机型、带底部安全区机型和 Android 机型各预览一次。

## 页面与安全区

- [ ] Onboarding、Body Profile、Nutrition Plan 顶部内容不被状态栏遮挡。
- [ ] 含底部导航的 Home 页面滚动到底部时，最后一张卡片不被导航栏遮挡。
- [ ] Onboarding、Body Profile、Nutrition Plan 的无 tab 页面底部按钮可完整露出。
- [ ] Body Profile 聚焦年龄、身高、体重、训练频率和目标体重输入框时，键盘不会遮挡当前输入框或提交按钮；可继续滚动查看错误提示。
- [ ] 小屏设备中两列表单、目标卡和营养卡没有横向滚动或文字裁切。

## 首次使用链路

- [ ] 未选择目标时，“继续”保持禁用；选择后文字、图标和单选状态均为简体中文视觉规范。
- [ ] 选择任一目标后可继续；从身体资料返回时，目标仍保持选中。
- [ ] Onboarding 使用 `getMenuButtonBoundingClientRect` 动态避让微信胶囊；品牌、返回按钮和步骤文字不重叠。
- [ ] 年龄、身高、体重、训练频率与目标日期的错误信息显示在对应字段附近。
- [ ] 填写合法资料后，Nutrition Plan 显示目标、热量、蛋白质、碳水和脂肪。
- [ ] 在 Nutrition Plan 选择“返回调整”后，所有资料仍保留；“开始使用”进入 Home fixture。

## WXSS 与图形回归

- [ ] 圆形进度、渐变扫描框、阴影、圆角和自定义底部导航在目标基础库版本中正常渲染。
- [ ] 无 SVG、远程字体或浏览器 `window` / `document` API 依赖。
- [ ] 底部导航已移除非必要的 `backdrop-filter` 依赖；若低版本基础库不支持 `conic-gradient`，圆形进度应作为视觉降级项记录，不影响首次使用链路。

## Dashboard 与饮食记录

- [ ] 在 iPhone SE、小屏 Android 与主流全面屏 iPhone 上检查 Home、Meal Records 和 Meal Detail 的长页面滚动。
- [ ] 确认固定 BottomTabBar 不遮挡 Home 与 Records 最后一项；无底部导航的 Detail 操作按钮完整可见。
- [ ] 检查本地 SVG 餐次插画能正常显示；显示失败时餐次卡仍保留名称、时间、营养和可点击区域。
- [ ] 使用低版本基础库预览圆形进度。若不渲染 conic-gradient，确认 ProgressFallback 仍显示百分比和线性进度，不出现空白或 NaN。
- [ ] 检查日期选择、搜索输入键盘、清除搜索、分页按钮和删除确认弹窗不造成横向溢出或内容截断。
