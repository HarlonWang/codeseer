# CodeSeer

自建的 GitHub PR 审查机器人：GitHub App 形态，装到账号下全部仓库，PR 打开或更新时用 OpenAI 审 diff，把 summary 和 inline 意见回写到 PR，并跟踪上一轮意见是否已处理。

评论区显示为 `codeseer[bot]`。

## 为什么自己做

- 现有收费审查工具对私有仓库有限制，或只给试用期
- 想要一处安装、全仓生效，不在每个仓库里维护 workflow 文件

## 文档

- `docs/design.md` 方案与已定决策，开工前先读

## 状态

设计定稿，实现未开始。
