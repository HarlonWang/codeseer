import type { ReviewComment } from "../github/pr";
import type { TrackedFinding } from "../state";
import type { ModelFinding, Severity } from "./model";
import type { SkippedFile } from "./select";

const SEVERITY_LABEL: Record<Severity, string> = { high: "严重", medium: "建议", low: "细节" };
const SEVERITY_RANK: Record<Severity, number> = { high: 2, medium: 1, low: 0 };

function isBlocking(severity: Severity | undefined): boolean {
    return severity !== "low";
}

export interface ValidFinding extends ModelFinding {
    line: number;
}

export function partitionFindings(
    findings: ModelFinding[],
    validLines: Map<string, Set<number>>,
): { inline: ValidFinding[]; overflow: ModelFinding[] } {
    const inline: ValidFinding[] = [];
    const overflow: ModelFinding[] = [];
    for (const f of findings) {
        if (!f.comment.trim()) continue;
        if (validLines.get(f.path)?.has(f.line)) inline.push(f);
        else overflow.push(f);
    }
    return { inline, overflow };
}

export interface SeverityComment extends ReviewComment {
    severity: Severity;
}

export function toReviewComments(findings: ValidFinding[]): SeverityComment[] {
    const byKey = new Map<string, ValidFinding[]>();
    for (const f of findings) {
        const key = `${f.path}:${f.line}`;
        const list = byKey.get(key) ?? [];
        list.push(f);
        byKey.set(key, list);
    }
    return [...byKey.values()].map((group) => ({
        path: group[0].path,
        line: group[0].line,
        body: group.map((f) => `**[${SEVERITY_LABEL[f.severity]}]** ${f.comment.trim()}`).join("\n\n"),
        severity: group.reduce((max, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[max] ? f.severity : max), group[0].severity),
    }));
}

export interface Verdict {
    approve: boolean;
    reasons: string[];
}

export function decideVerdict(input: { findings: ModelFinding[]; pending: TrackedFinding[]; skipped: SkippedFile[] }): Verdict {
    const reasons: string[] = [];
    const blockingNow = input.findings.filter((f) => f.comment.trim() && isBlocking(f.severity)).length;
    const blockingPending = input.pending.filter((f) => isBlocking(f.severity)).length;
    if (blockingNow > 0) reasons.push(`本轮 ${blockingNow} 条严重或建议级意见`);
    if (blockingPending > 0) reasons.push(`上轮 ${blockingPending} 条严重或建议级意见待处理`);
    if (input.skipped.length > 0) reasons.push(`${input.skipped.length} 个文件未审查`);
    return { approve: reasons.length === 0, reasons };
}

export interface ReportInput {
    mode: "full" | "incremental";
    fromSha: string | null;
    headSha: string;
    model: string;
    summary: string;
    judged: TrackedFinding[];
    resolved: TrackedFinding[];
    resolveFailed: TrackedFinding[];
    carried: TrackedFinding[];
    overflow: ModelFinding[];
    skipped: SkippedFile[];
    degraded: SkippedFile[];
    verdict?: Verdict;
}

function excerpt(s: string, n = 80): string {
    const one = s.replace(/\s+/g, " ").trim();
    return one.length > n ? `${one.slice(0, n)}…` : one;
}

function verdictLine(v: Verdict): string {
    return v.approve ? "**结论**：批准" : `**结论**：不批准（${v.reasons.join("；")}）`;
}

export function composeReviewBody(input: ReportInput): string {
    const parts: string[] = ["## CodeSeer 审查"];
    if (input.verdict) parts.push(verdictLine(input.verdict));
    const previousTotal = input.judged.length + input.carried.length;
    if (previousTotal > 0) {
        const pending = [...input.carried, ...input.judged.filter((f) => !input.resolved.includes(f))];
        const lines = [`**上轮意见**：${previousTotal} 条，已处理 ${input.resolved.length} 条，待处理 ${pending.length} 条`];
        for (const f of pending) lines.push(`- \`${f.path}:${f.line}\` ${excerpt(f.comment)}`);
        if (input.resolveFailed.length > 0) {
            lines.push("", "以下意见已处理，但标记 resolved 失败（原因见 Worker 日志），请手动 resolve：");
            for (const f of input.resolveFailed) lines.push(`- \`${f.path}:${f.line}\` ${excerpt(f.comment)}`);
        }
        parts.push(lines.join("\n"));
    }
    parts.push(`### 摘要\n${input.summary.trim()}`);
    if (input.overflow.length > 0) {
        const lines = input.overflow.map((f) => `- \`${f.path}:${f.line}\` **[${SEVERITY_LABEL[f.severity]}]** ${f.comment.trim()}`);
        parts.push(`### 其他意见\n不在改动行上，无法挂为行内评论：\n${lines.join("\n")}`);
    }
    if (input.degraded.length > 0) {
        const lines = input.degraded.map((d) => `- \`${d.path}\`：${d.reason}`);
        parts.push(`### 只按 diff 审查的文件\n${lines.join("\n")}`);
    }
    if (input.skipped.length > 0) {
        const lines = input.skipped.map((s) => `- \`${s.path}\`：${s.reason}`);
        parts.push(`### 跳过的文件\n${lines.join("\n")}`);
    }
    const scope =
        input.mode === "full"
            ? `整个 PR 至 ${input.headSha.slice(0, 7)}`
            : `增量 ${input.fromSha?.slice(0, 7)}..${input.headSha.slice(0, 7)}`;
    parts.push(`<sub>${scope} · ${input.model}</sub>`);
    return parts.join("\n\n");
}

export function composeNoReviewBody(input: { verdict?: Verdict; skipped: SkippedFile[]; headSha: string }): string {
    const parts: string[] = ["## CodeSeer 审查"];
    if (input.verdict) parts.push(verdictLine(input.verdict));
    parts.push("本轮改动没有可审查的代码。");
    if (input.skipped.length > 0) {
        const lines = input.skipped.map((s) => `- \`${s.path}\`：${s.reason}`);
        parts.push(`### 跳过的文件\n${lines.join("\n")}`);
    }
    parts.push(`<sub>至 ${input.headSha.slice(0, 7)}</sub>`);
    return parts.join("\n\n");
}
