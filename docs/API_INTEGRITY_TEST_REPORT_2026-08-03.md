# API 完整性测试报告（阶段一）

测试时间：2026-08-03（Asia/Shanghai）  
目标：已部署的 `get-login-ticket` HTTPS 接口  
测试方式：真实线上请求；不使用模拟响应；不输出会话、密钥或个人数据。

## 已执行结果

| 编号 | 用例 | 实际状态 | 结果 |
| --- | --- | ---: | --- |
| L-01 | `OPTIONS /foods/categories` | 204 | 通过 |
| L-02 | 未携带 Bearer Token 的 `GET /account` | 401 `UNAUTHORIZED` | 通过 |
| L-03 | `GET /api-integrity-does-not-exist` | 404 `NOT_FOUND` | 通过 |
| L-04 | 空 body 的 `POST /` 登录请求 | 400 `WECHAT_CODE_INVALID` | 通过 |

以上四项均针对真实已部署服务执行。L-02、L-03、L-04 验证了认证、路由和登录入参拒绝链路，不会创建、更新或删除任何用户数据。

## 脚本自身验证

执行命令：

```bash
node --test scripts/api-integrity/config.test.mjs scripts/api-integrity/http-client.test.mjs
node --check scripts/api-integrity/config.mjs
node --check scripts/api-integrity/http-client.mjs
node --check scripts/api-integrity/run-readonly.mjs
node --check scripts/api-integrity/run-authenticated-readonly.mjs
git diff --check
```

结果：5 个单元测试全部通过；四个脚本通过 Node 语法检查；补丁检查通过。

## 未执行范围与原因

以下真实接口必须带服务端签发的产品 Session，当前机器未配置两份隔离的测试用户 Session，因此未执行：

- 账号、食品、餐食、每日汇总、周报和成就的已认证读取；
- 用户资料、设置、营养计划和餐食的写入—清理闭环；
- 用户 A/B 数据隔离；
- 识图、教练和其他会产生 AI 成本的接口；
- 管理员图片任务、内部 HMAC 调度、账号注销等高副作用接口。

这不是接口失败；是为了避免使用个人会话、篡改真实业务数据或将会话凭据写入本地文件而保留的执行门槛。

## 继续执行所需参数

将两个专用测试用户的短期产品 Session 仅注入当前终端或 CI 密钥库，再运行：

```bash
API_BASE_URL='https://<env>.service.tcloudbase.com/get-login-ticket' \
TEST_PRODUCT_TOKEN_A='<token-a>' \
TEST_PRODUCT_TOKEN_B='<token-b>' \
node scripts/api-integrity/run-authenticated-readonly.mjs
```

写入测试只允许独立沙箱环境，并额外要求：

```bash
TEST_ENV_CONFIRMATION=sandbox
ALLOW_PERSISTENT_WRITES=1
TEST_RUN_ID='<uuid>'
```

参数模板见 `scripts/api-integrity/.env.example`。脚本拒绝把 `production` 或未确认环境用于持久写入。
