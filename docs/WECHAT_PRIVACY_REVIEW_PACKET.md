# Nordic Nutri AI 微信隐私审核材料包

状态：`DRAFT — OWNER INPUT REQUIRED`

本材料包只整理当前仓库已有事实，不代填主体、联系方式、审核账号或平台配置。未确认项必须在提交审核前补齐，不能用占位值提交。

## 已有产品说明

- 产品名称：Nordic Nutri AI
- 当前隐私政策页面：小程序 `隐私政策与免责声明`
- 已说明处理范围：微信登录身份标识、昵称/头像、身体与营养目标、饮食记录、主动上传的餐食图片、反馈内容。
- AI 用途：主动选择餐食图片后，用于识别食材、生成营养估算和参考建议。
- 权限用途：相机/相册用于选择餐食图片；相册/保存能力用于用户主动发起的分享海报。
- 删除路径：`我的 → 注销 Nordic Nutri AI 产品账号`；注销产品账号不影响微信账号。
- 免责声明：营养识别、估算和教练建议不构成医疗诊断、治疗或处方。
- 当前页面版本：`1.0.0`，生效日期 `2026-08-16`（提交前由负责人确认）。

## 必须由负责人补齐

| 项目 | 当前状态 | 证据/动作 |
|---|---|---|
| 真实运营主体全称 | PENDING OWNER INPUT | 替换页面中的个人开发者占位信息 |
| 有效联系邮箱/电话 | PENDING OWNER INPUT | 与页面和微信平台主体信息一致 |
| 微信公众平台隐私指引 | PASS — PLATFORM UPDATED / UGC DECLARED (2026-08-19) | 微信公众平台“服务内容声明”显示用户隐私保护指引已更新，且用户生成内容（UGC）场景已声明；仍需留存平台回读截图/记录并确认与页面文案一致 |
| 审核测试微信号 | PENDING OWNER INPUT | 不使用真实用户凭据 |
| 生产 HTTPS 域名 | PARTIAL — CODE CONFIGURED / PLATFORM READBACK PENDING | 当前代码配置请求域名 `lewis-healthy-d4glgqqzv73a5bc10.service.tcloudbase.com`，下载/分享资源域名 `lewis-healthy-d4glgqqzv73a5bc10-1420560890.tcloudbaseapp.com`；仍需微信平台配置回读 |
| CloudBase 套餐/EnvId 记录 | PARTIAL — PLATFORM READBACK 2026-08-19 | EnvId `lewis-healthy-d4glgqqzv73a5bc10`；套餐 `baas_personal`；环境状态 NORMAL；到期时间 2026-09-03；提交前仍需负责人确认套餐/续期安排 |
| 删除核验 | PENDING PRODUCTION EVIDENCE | 测试账号注销后回读 PG 用户数据和私有对象 |
| 告警接收人 | PENDING OPS CONFIG | 5xx、视觉失败率、p95、限流、注销失败、日成本 |
| 回滚负责人/版本 | PENDING RELEASE RECORD | 与 production release bundle 一起冻结 |

## 提交前禁止事项

- 不把测试 token、HMAC、数据库/API key 或真实用户资料放入审核材料。
- 不把本地测试通过、函数 Active、截图或普通图片识别成功当作复杂图片异步闭环证据。
- 不在主体、联系方式、平台隐私声明未确认前宣称隐私 Gate PASS。

## 当前结论

隐私页面和产品删除入口已存在，但隐私/审核材料包尚未达到可提交状态；整体发布仍需保持 `NO-GO`，直到上表必填项和删除回读证据完成。
