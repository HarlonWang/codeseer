# CodeSeer

GitHub App 形态的 PR 审查机器人，跑在 Cloudflare Workers 上。**开工前先读 README.md 和 `docs/design.md`**，形态、链路、状态存储、审查引擎的输入输出都定在那里。

## 边界

- 单租户：只服务 HarlonWang 账号下的仓库，不做多租户结构
- 第一版范围见 `docs/design.md` 的「不做」一节，范围外的需求先讨论再动手
