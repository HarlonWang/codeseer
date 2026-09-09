<p align="center"><img src="assets/logo.png" width="128" alt="CodeSeer logo"></p>

<h1 align="center">CodeSeer</h1>

[English](README.md) | 简体中文

自建的 GitHub PR 审查机器人。以 GitHub App 形态装一次，账号下所有仓库的 PR 都会得到 AI 审查：一段 summary、若干 inline 意见，并跟踪上一轮意见是否已处理。

跑在 Cloudflare Workers 上，用 OpenAI 审查。

## 为什么自己做

- 现有收费审查工具对私有仓库有限制，或只给试用期
- 不想每个仓库维护 workflow 文件：一处安装、全仓生效，新建仓库自动纳入

## 做什么

- PR 打开、重开、草稿转正式或 push 新 commit 时审查。草稿 PR 和机器人发起的 PR 不审
- 喂改动文件的全文，改动标记铺在全文上，改动行之外的问题也审得出来
- push 新 commit 只审增量，上一轮意见被模型确认修掉的自动 resolve
- 没有 high、medium 级意见且没有跳过的文件时批准（approve）PR，否则只留评论，不会 request changes
- 审查评论用简体中文，改语言在 `src/review/prompt.ts` 的 `SYSTEM_PROMPT`

## 部署

1. 建一个 GitHub App：订阅 `pull_request` 事件，权限给 Pull requests（读写）、Contents（读写，resolve thread 需要）、Metadata（读）。生成私钥和 webhook secret
2. 把 App ID 填进 `wrangler.toml` 的 `GITHUB_APP_ID`，再设三样 secret：

   ```bash
   npx wrangler secret put GITHUB_PRIVATE_KEY
   npx wrangler secret put GITHUB_WEBHOOK_SECRET
   npx wrangler secret put OPENAI_API_KEY
   ```

3. `npm install && npm run deploy`，把 App 的 webhook 地址设为 `https://<你的 worker>/webhook`
4. 把 App 装到账号下，范围选 All repositories

需要 Cloudflare Workers 付费版（用到 Queues）。

## 配置

可调项都在 `wrangler.toml` 的 `[vars]` 里，改完 `npm run deploy` 生效。

| 变量 | 默认 | 说明 |
|------|------|------|
| `OPENAI_MODEL` | `gpt-5.6-terra` | 模型型号，需支持结构化输出 |
| `OPENAI_REASONING_EFFORT` | `high` | `low` / `medium` / `high` |
| `MAX_FILE_DIFF_LINES` | `2000` | 单文件改动行数超过即跳过，summary 里会列出 |
| `MAX_TOTAL_DIFF_CHARS` | `480000` | 单次审查的代码总字符上限。超出时最大的文件先退回只喂 diff，仍超出的跳过 |
| `FULL_FILE_MAX_LINES` | `1000` | 改动文件不超过这个行数就喂全文，超过则只喂每个改动点周围的片段 |
| `CONTEXT_WINDOW_LINES` | `150` | 片段模式下每个改动点上下各保留的行数 |
| `APPROVE_ENABLED` | `true` | 满足判据时以 approve 提交；`false` 则一律只评论 |

需要改代码的项：

- 忽略规则：`src/review/ignore.ts`
- 只喂 diff 不喂全文的文件类型（文档、资源、配置）：`src/review/select.ts` 的 `DIFF_ONLY`
- 审查口径与评论语言：`src/review/prompt.ts` 的 `SYSTEM_PROMPT`
- 触发事件：`src/github/webhook.ts` 的 `TRIGGER_ACTIONS`

## 运维

```bash
npx wrangler tail codeseer --format pretty                          # 实时日志，含每次审查的 token 用量
npx wrangler kv key get --binding STATE --remote "owner/repo#123"   # 某个 PR 的审查状态
npx wrangler queues purge codeseer-review-dlq                       # 清理死信队列
```

想让某个 PR 重审整个 diff：删掉它的 KV 记录后 push 一个 commit。

## 设计

方案与已定决策见 `docs/design.md`。

## 许可证

[MIT](LICENSE)
