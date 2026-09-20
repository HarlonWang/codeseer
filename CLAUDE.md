# CodeSeer

GitHub App 形态的 PR 审查机器人，跑在 Cloudflare Workers 上。**开工前先读 README.md 和 `docs/design.md`**，形态、链路、状态存储、审查引擎的输入输出都定在那里。

## 边界

- 单租户：只服务 HarlonWang 账号与 tiny-ui 组织下的仓库（`ALLOWED_OWNERS`），不做多租户结构
- 仓库里的 `wrangler.toml` 是通用模板，账号相关的值不进 git；本账号部署一律用：
  `npx wrangler deploy --var GITHUB_APP_ID:4845701 --var ALLOWED_OWNERS:HarlonWang,tiny-ui --var REVIEW_LANGUAGE:zh-CN`
  漏带参数的后果是 owners 为空、所有 webhook 被忽略（日志有提示），不会误审别人
- 第一版范围见 `docs/design.md` 的「不做」一节，范围外的需求先讨论再动手
