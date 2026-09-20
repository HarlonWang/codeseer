import type { Severity } from "./model";

export type Lang = "en" | "zh-CN";

export interface Messages {
    outputLanguage: string;
    severity: Record<Severity, string>;
    title: string;
    approved: string;
    notApproved: (reasons: string[]) => string;
    blockingNow: (n: number) => string;
    blockingPending: (n: number) => string;
    skippedCount: (n: number) => string;
    previous: (total: number, resolved: number, pending: number) => string;
    resolveFailed: string;
    summary: string;
    overflow: string;
    degraded: string;
    skipped: string;
    scopeFull: (head: string) => string;
    scopeIncremental: (from: string, head: string) => string;
    nothingToReview: string;
    upTo: (head: string) => string;
    item: (path: string, reason: string) => string;
    binary: string;
    diffTooLarge: (limit: number, changed: number) => string;
    sourceMissing: string;
    sourceMismatch: string;
    budgetExceeded: string;
    lockFile: string;
    binaryAsset: string;
    generatedDir: string;
    generatedFile: string;
}

const en: Messages = {
    outputLanguage: "Write in English; keep code identifiers, file names and API names as they are.",
    severity: { high: "High", medium: "Medium", low: "Low" },
    title: "## CodeSeer review",
    approved: "**Verdict**: approved",
    notApproved: (reasons) => `**Verdict**: not approved (${reasons.join("; ")})`,
    blockingNow: (n) => `${n} high or medium finding${n === 1 ? "" : "s"} this round`,
    blockingPending: (n) => `${n} high or medium finding${n === 1 ? "" : "s"} from the last round still open`,
    skippedCount: (n) => `${n} file${n === 1 ? "" : "s"} not reviewed`,
    previous: (total, resolved, pending) => `**Last round**: ${total} finding${total === 1 ? "" : "s"}, ${resolved} resolved, ${pending} still open`,
    resolveFailed: "These were addressed but could not be marked resolved (see Worker logs); please resolve them by hand:",
    summary: "### Summary",
    overflow: "### Other findings\nNot on a changed line, so they cannot be inline comments:",
    degraded: "### Files reviewed by diff only",
    skipped: "### Skipped files",
    scopeFull: (head) => `whole PR up to ${head}`,
    scopeIncremental: (from, head) => `increment ${from}..${head}`,
    nothingToReview: "Nothing reviewable in this round of changes.",
    upTo: (head) => `up to ${head}`,
    item: (path, reason) => `- \`${path}\`: ${reason}`,
    binary: "binary",
    diffTooLarge: (limit, changed) => `diff exceeds ${limit} lines (${changed} lines)`,
    sourceMissing: "source file could not be fetched",
    sourceMismatch: "file content does not match the diff",
    budgetExceeded: "review size limit reached",
    lockFile: "lock file",
    binaryAsset: "binary asset",
    generatedDir: "generated or third-party directory",
    generatedFile: "generated file",
};

const zhCN: Messages = {
    outputLanguage: "用简体中文写，代码标识符、文件名、API 名保留英文。",
    severity: { high: "严重", medium: "建议", low: "细节" },
    title: "## CodeSeer 审查",
    approved: "**结论**：批准",
    notApproved: (reasons) => `**结论**：不批准（${reasons.join("；")}）`,
    blockingNow: (n) => `本轮 ${n} 条严重或建议级意见`,
    blockingPending: (n) => `上轮 ${n} 条严重或建议级意见待处理`,
    skippedCount: (n) => `${n} 个文件未审查`,
    previous: (total, resolved, pending) => `**上轮意见**：${total} 条，已处理 ${resolved} 条，待处理 ${pending} 条`,
    resolveFailed: "以下意见已处理，但标记 resolved 失败（原因见 Worker 日志），请手动 resolve：",
    summary: "### 摘要",
    overflow: "### 其他意见\n不在改动行上，无法挂为行内评论：",
    degraded: "### 只按 diff 审查的文件",
    skipped: "### 跳过的文件",
    scopeFull: (head) => `整个 PR 至 ${head}`,
    scopeIncremental: (from, head) => `增量 ${from}..${head}`,
    nothingToReview: "本轮改动没有可审查的代码。",
    upTo: (head) => `至 ${head}`,
    item: (path, reason) => `- \`${path}\`：${reason}`,
    binary: "二进制",
    diffTooLarge: (limit, changed) => `diff 超过 ${limit} 行（${changed} 行）`,
    sourceMissing: "源文件未拉到",
    sourceMismatch: "文件内容与 diff 不符",
    budgetExceeded: "本次审查总量已达上限",
    lockFile: "lock 文件",
    binaryAsset: "二进制资源",
    generatedDir: "生成或第三方目录",
    generatedFile: "生成文件",
};

export const MESSAGES: Record<Lang, Messages> = { en, "zh-CN": zhCN };

export function messagesOf(lang: string | undefined): Messages {
    return lang === "zh-CN" ? zhCN : en;
}
