import type { Limits } from "../env";
import { annotate, annotateWithSource, changedLineCount, splitSource, type ContextMode, type DiffFile } from "./diff";
import { ignoreReason } from "./ignore";
import type { Messages } from "./messages";

export interface SelectedFile {
    file: DiffFile;
    text: string;
    context: ContextMode;
}

export interface SkippedFile {
    path: string;
    reason: string;
}

export interface Selection {
    selected: SelectedFile[];
    skipped: SkippedFile[];
    degraded: SkippedFile[];
}

const DIFF_ONLY = /\.(md|txt|xml|json|ya?ml|toml|properties|svg|csv|html?)$/i;

function skipReason(file: DiffFile, limits: Limits, m: Messages): string | null {
    const ignored = ignoreReason(file.path, m);
    if (ignored) return ignored;
    if (file.binary) return m.binary;
    const changed = changedLineCount(file);
    if (changed > limits.maxFileDiffLines) return m.diffTooLarge(limits.maxFileDiffLines, changed);
    return null;
}

export function wantsSource(file: DiffFile, limits: Limits, m: Messages): boolean {
    if (file.status !== "modified" && file.status !== "renamed") return false;
    if (file.hunks.length === 0 || DIFF_ONLY.test(file.path)) return false;
    return skipReason(file, limits, m) === null;
}

interface Candidate {
    file: DiffFile;
    diff: string;
    rich: { text: string; mode: ContextMode } | null;
    richMissing: string | null;
}

export function selectFiles(files: DiffFile[], limits: Limits, m: Messages, sources: Map<string, string> = new Map()): Selection {
    const candidates: Candidate[] = [];
    const skipped: SkippedFile[] = [];
    for (const file of files) {
        const reason = skipReason(file, limits, m);
        if (reason) {
            skipped.push({ path: file.path, reason });
            continue;
        }
        if (file.hunks.length === 0) continue;
        let rich: Candidate["rich"] = null;
        let richMissing: string | null = null;
        if (wantsSource(file, limits, m)) {
            const source = sources.get(file.path);
            if (source === undefined) richMissing = m.sourceMissing;
            else {
                rich = annotateWithSource(file, splitSource(source), limits);
                if (!rich) richMissing = m.sourceMismatch;
            }
        }
        candidates.push({ file, diff: annotate(file), rich, richMissing });
    }

    // 总量超限时先退化省得最多的全文，退化文件数最少；全文不比 diff 长的退了没用
    const useDiff = new Set<string>();
    let total = candidates.reduce((sum, c) => sum + (c.rich?.text.length ?? c.diff.length), 0);
    const saving = (c: Candidate) => (c.rich ? c.rich.text.length - c.diff.length : 0);
    for (const c of candidates.filter((c) => saving(c) > 0).sort((a, b) => saving(b) - saving(a))) {
        if (total <= limits.maxTotalDiffChars) break;
        total -= saving(c);
        useDiff.add(c.file.path);
    }

    const selected: SelectedFile[] = [];
    const degraded: SkippedFile[] = [];
    let budget = limits.maxTotalDiffChars;
    for (const c of candidates) {
        const degrade = c.rich !== null && useDiff.has(c.file.path);
        const text = c.rich && !degrade ? c.rich.text : c.diff;
        if (text.length > budget) {
            skipped.push({ path: c.file.path, reason: m.budgetExceeded });
            continue;
        }
        budget -= text.length;
        selected.push({ file: c.file, text, context: c.rich && !degrade ? c.rich.mode : "diff" });
        if (degrade) degraded.push({ path: c.file.path, reason: m.budgetExceeded });
        else if (c.richMissing) degraded.push({ path: c.file.path, reason: c.richMissing });
    }
    return { selected, skipped, degraded };
}
