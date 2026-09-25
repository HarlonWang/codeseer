<p align="center"><img src="assets/logo.png" width="128" alt="CodeSeer logo"></p>

<h1 align="center">CodeSeer</h1>

English | [简体中文](README.zh-CN.md)

A self-hosted GitHub PR reviewer. Install it as a GitHub App once, and every PR under your account gets an AI review: a summary, inline comments, and follow-up on whether last round's comments were addressed.

Runs on Cloudflare Workers, reviews with OpenAI.

## Why

- Hosted review tools limit private repos or only offer trials
- No per-repo workflow files: install once, all repos covered, new repos included automatically

## What it does

- Reviews a PR when it is opened, reopened, marked ready, or gets new commits. Draft PRs and bot-authored PRs are skipped
- Reads the full content of changed source files, with the diff marked on top, so problems outside the changed lines are caught
- On new commits, reviews only the increment and resolves earlier threads the model confirms as fixed
- Approves the PR when there are no high findings and no skipped files (medium findings are listed but do not block); otherwise leaves a comment. It never requests changes
- Reports itself in the PR's checks section: a `CodeSeer review` check run that turns green with a one-line tally, grey when the round was skipped, or red with the reason when the review failed. A failed round also gets a comment, so nothing fails silently
- Review comments are written in English by default; `REVIEW_LANGUAGE` switches them to Simplified Chinese

## Deploy

1. Create a GitHub App: subscribe to the `pull_request` event, grant Pull requests (read & write), Contents (read & write, required by thread resolving), Checks (read & write, for the status check) and Metadata (read). Generate a private key and a webhook secret
2. In `wrangler.toml`, fill in `GITHUB_APP_ID` and `ALLOWED_OWNERS` (the users or orgs whose PRs get reviewed), then set the three secrets:

   ```bash
   npx wrangler secret put GITHUB_PRIVATE_KEY
   npx wrangler secret put GITHUB_WEBHOOK_SECRET
   npx wrangler secret put OPENAI_API_KEY
   ```

3. `npm install && npm run deploy`, then set the App's webhook URL to `https://<your-worker>/webhook`
4. Install the App on your account with "All repositories"

Requires a Cloudflare Workers paid plan for Queues; the lowest tier ($5/month) is enough.

## Configuration

Tunables live in `[vars]` of `wrangler.toml`; run `npm run deploy` after changing them.

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_MODEL` | `gpt-5.6-terra` | Model; must support structured output |
| `OPENAI_REASONING_EFFORT` | `high` | `low` / `medium` / `high` |
| `MAX_FILE_DIFF_LINES` | `2000` | Files with more changed lines are skipped and listed in the summary |
| `MAX_TOTAL_DIFF_CHARS` | `480000` | Total code characters per review. Over the limit, largest files fall back to diff-only, then get skipped |
| `FULL_FILE_MAX_LINES` | `1000` | Changed files up to this length are sent in full; longer ones as windows around each hunk |
| `CONTEXT_WINDOW_LINES` | `150` | Lines kept above and below each hunk in window mode |
| `APPROVE_ENABLED` | `true` | Submit `APPROVE` when the criteria are met; `false` always comments |
| `ALLOWED_OWNERS` | (empty) | Repository owners (users or orgs) whose PRs get reviewed, comma-separated; the app is public, so any other installation is ignored. Empty means nothing is reviewed |
| `REVIEW_LANGUAGE` | `en` | Language of the review comments: `en` or `zh-CN` |

Code-level knobs:

- Ignore rules: `src/review/ignore.ts`
- File types sent as diff only (docs, assets, config): `DIFF_ONLY` in `src/review/select.ts`
- Review criteria: `systemPrompt` in `src/review/prompt.ts`; comment wording per language: `src/review/messages.ts`
- Trigger events: `TRIGGER_ACTIONS` in `src/github/webhook.ts`

## Operations

```bash
npx wrangler tail codeseer --format pretty                          # live logs, token usage per review
npx wrangler kv key get --binding STATE --remote "owner/repo#123"   # review state of one PR
npx wrangler queues purge codeseer-review-dlq                       # clear the dead-letter queue
```

To force a full re-review of a PR, delete its KV record and push a commit.

A red `CodeSeer review` check carries the failure reason in its title, and the same reason is posted as a PR comment; the Worker logs hold the stack trace. The check run never blocks a merge — do not mark it required.

## Design

Architecture and decisions: `docs/design.md` (Chinese).

## License

[MIT](LICENSE)
