import type { ReviewComment } from "../github/pr";
import type { TrackedFinding } from "../state";
import type { Messages } from "./messages";
import type { ModelFinding, Severity } from "./model";
import type { SkippedFile } from "./select";

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

export function toReviewComments(findings: ValidFinding[], m: Messages): SeverityComment[] {
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
        body: group.map((f) => `**[${m.severity[f.severity]}]** ${f.comment.trim()}`).join("\n\n"),
        severity: group.reduce((max, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[max] ? f.severity : max), group[0].severity),
    }));
}

export interface Verdict {
    approve: boolean;
    reasons: string[];
}

export function decideVerdict(input: { findings: ModelFinding[]; pending: TrackedFinding[]; skipped: SkippedFile[] }, m: Messages): Verdict {
    const reasons: string[] = [];
    const blockingNow = input.findings.filter((f) => f.comment.trim() && isBlocking(f.severity)).length;
    const blockingPending = input.pending.filter((f) => isBlocking(f.severity)).length;
    if (blockingNow > 0) reasons.push(m.blockingNow(blockingNow));
    if (blockingPending > 0) reasons.push(m.blockingPending(blockingPending));
    if (input.skipped.length > 0) reasons.push(m.skippedCount(input.skipped.length));
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

function verdictLine(v: Verdict, m: Messages): string {
    return v.approve ? m.approved : m.notApproved(v.reasons);
}

export function composeReviewBody(input: ReportInput, m: Messages): string {
    const parts: string[] = [m.title];
    if (input.verdict) parts.push(verdictLine(input.verdict, m));
    const previousTotal = input.judged.length + input.carried.length;
    if (previousTotal > 0) {
        const pending = [...input.carried, ...input.judged.filter((f) => !input.resolved.includes(f))];
        const lines = [m.previous(previousTotal, input.resolved.length, pending.length)];
        for (const f of pending) lines.push(`- \`${f.path}:${f.line}\` ${excerpt(f.comment)}`);
        if (input.resolveFailed.length > 0) {
            lines.push("", m.resolveFailed);
            for (const f of input.resolveFailed) lines.push(`- \`${f.path}:${f.line}\` ${excerpt(f.comment)}`);
        }
        parts.push(lines.join("\n"));
    }
    parts.push(`${m.summary}\n${input.summary.trim()}`);
    if (input.overflow.length > 0) {
        const lines = input.overflow.map((f) => `- \`${f.path}:${f.line}\` **[${m.severity[f.severity]}]** ${f.comment.trim()}`);
        parts.push(`${m.overflow}\n${lines.join("\n")}`);
    }
    if (input.degraded.length > 0) {
        const lines = input.degraded.map((d) => m.item(d.path, d.reason));
        parts.push(`${m.degraded}\n${lines.join("\n")}`);
    }
    if (input.skipped.length > 0) {
        const lines = input.skipped.map((s) => m.item(s.path, s.reason));
        parts.push(`${m.skipped}\n${lines.join("\n")}`);
    }
    const scope =
        input.mode === "full"
            ? m.scopeFull(input.headSha.slice(0, 7))
            : m.scopeIncremental(input.fromSha?.slice(0, 7) ?? "", input.headSha.slice(0, 7));
    parts.push(`<sub>${scope} · ${input.model}</sub>`);
    return parts.join("\n\n");
}

export function composeNoReviewBody(input: { verdict?: Verdict; skipped: SkippedFile[]; headSha: string }, m: Messages): string {
    const parts: string[] = [m.title];
    if (input.verdict) parts.push(verdictLine(input.verdict, m));
    parts.push(m.nothingToReview);
    if (input.skipped.length > 0) {
        const lines = input.skipped.map((s) => m.item(s.path, s.reason));
        parts.push(`${m.skipped}\n${lines.join("\n")}`);
    }
    parts.push(`<sub>${m.upTo(input.headSha.slice(0, 7))}</sub>`);
    return parts.join("\n\n");
}

export interface CheckTitleInput {
    findings: number;
    previousTotal: number;
    resolved: number;
    pending: number;
    skipped: number;
    approved: boolean;
    nothingToReview: boolean;
}

export function composeCheckTitle(input: CheckTitleInput, m: Messages): string {
    const parts = [input.nothingToReview ? m.checkNothing : m.checkFindings(input.findings)];
    if (input.previousTotal > 0) parts.push(m.checkPrevious(input.resolved, input.pending));
    if (input.skipped > 0) parts.push(m.skippedCount(input.skipped));
    if (input.approved) parts.push(m.checkApproved);
    return parts.join(m.checkSep);
}
