# CodeSeer

自建的 GitHub PR 审查机器人：GitHub App 形态，装到账号下全部仓库，PR 打开或更新时用 OpenAI 审 diff，把 summary 和 inline 意见回写到 PR，并跟踪上一轮意见是否已处理。

评论区显示为 `codeseerbot[bot]`（GitHub App 名不能与已有账号同名，`codeseer` 已被占）。

## 为什么自己做

- 现有收费审查工具对私有仓库有限制，或只给试用期
- 想要一处安装、全仓生效，不在每个仓库里维护 workflow 文件

## 用法

装好后无需任何操作：账号下任何仓库开 PR、push 新 commit、草稿转正式或重开 PR，`codeseerbot[bot]` 都会来审。草稿 PR 和机器人发起的 PR（如 dependabot）不审。

### 配置

可调项都在 `wrangler.toml` 的 `[vars]` 里，改完 `npm run deploy` 生效：

| 变量 | 默认 | 说明 |
|------|------|------|
| `OPENAI_MODEL` | `gpt-5.6-terra` | 模型型号，需支持结构化输出；选型看免费额度分组（`docs/design.md` 第 12 节） |
| `OPENAI_REASONING_EFFORT` | `high` | 推理强度 `low` / `medium` / `high`，越高越慢越贵 |
| `MAX_FILE_DIFF_LINES` | `2000` | 单文件改动行数超过即跳过，summary 里会列出 |
| `MAX_TOTAL_DIFF_CHARS` | `480000` | 单次审查喂给模型的代码总字符上限。超出时先把最大的文件退回只喂 diff，仍超出的文件跳过，两种情况 summary 里都会列出 |
| `FULL_FILE_MAX_LINES` | `1000` | 改动过的代码文件不超过这个行数就喂全文，超过则只喂每个改动点上下 `CONTEXT_WINDOW_LINES` 行的片段 |
| `CONTEXT_WINDOW_LINES` | `150` | 片段模式下每个改动点上下各保留的行数 |

需要改代码的项：

- 忽略规则：`src/review/ignore.ts`
- 只喂 diff 不喂全文的文件类型（文档、资源、配置）：`src/review/select.ts` 的 `DIFF_ONLY`
- 审查口径与评论语言：`src/review/prompt.ts` 的 `SYSTEM_PROMPT`
- 触发事件：`src/github/webhook.ts` 的 `TRIGGER_ACTIONS`

Secrets 三样走 `npx wrangler secret put <NAME>`：`GITHUB_PRIVATE_KEY`、`GITHUB_WEBHOOK_SECRET`、`OPENAI_API_KEY`。

### 运维

```bash
npx wrangler tail codeseer --format pretty              # 实时日志，含每次审查的 token 用量
npx wrangler kv key get --binding STATE --remote "owner/repo#123"   # 某个 PR 的审查状态
npx wrangler queues purge codeseer-review-dlq            # 清理死信队列
```

某个 PR 想让它重审整个 diff：删掉该 PR 的 KV 记录后 push 一个 commit 即可。

## 文档

- `docs/design.md` 方案与已定决策，开工前先读

## 状态

第一版已上线：Worker 已部署，App 已装到全部仓库，PR #1 完成整 PR 审查、增量审查、已处理判定与 resolve 的全链路验证。
