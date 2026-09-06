import type { Limits } from "../env";
import { annotate, annotateWithSource, changedLineCount, splitSource, type ContextMode, type DiffFile } from "./diff";
import { ignoreReason } from "./ignore";

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
    degraded: string[];
}

const DIFF_ONLY = /\.(md|txt|xml|json|ya?ml|toml|properties|svg|csv|html?)$/i;

function skipReason(file: DiffFile, limits: Limits): string | null {
    const ignored = ignoreReason(file.path);
    if (ignored) return ignored;
    if (file.binary) return "二进制";
    const changed = changedLineCount(file);
    if (changed > limits.maxFileDiffLines) return `diff 超过 ${limits.maxFileDiffLines} 行（${changed} 行）`;
    return null;
}

export function wantsSource(file: DiffFile, limits: Limits): boolean {
    if (file.status !== "modified" && file.status !== "renamed") return false;
    if (file.hunks.length === 0 || DIFF_ONLY.test(file.path)) return false;
    return skipReason(file, limits) === null;
}

interface Candidate {
    file: DiffFile;
    diff: string;
    rich: { text: string; mode: ContextMode } | null;
}

export function selectFiles(files: DiffFile[], limits: Limits, sources: Map<string, string> = new Map()): Selection {
    const candidates: Candidate[] = [];
    const skipped: SkippedFile[] = [];
    for (const file of files) {
        const reason = skipReason(file, limits);
        if (reason) {
            skipped.push({ path: file.path, reason });
            continue;
        }
        if (file.hunks.length === 0) continue;
        const source = sources.get(file.path);
        const rich = source !== undefined && wantsSource(file, limits) ? annotateWithSource(file, splitSource(source), limits) : null;
        candidates.push({ file, diff: annotate(file), rich });
    }

    // 总量超限时先把最大的全文退回 diff，退化文件数最少
    const useDiff = new Set<string>();
    let total = candidates.reduce((sum, c) => sum + (c.rich?.text.length ?? c.diff.length), 0);
    const richest = candidates.filter((c) => c.rich).sort((a, b) => b.rich!.text.length - a.rich!.text.length);
    for (const c of richest) {
        if (total <= limits.maxTotalDiffChars) break;
        total -= c.rich!.text.length - c.diff.length;
        useDiff.add(c.file.path);
    }

    const selected: SelectedFile[] = [];
    const degraded: string[] = [];
    let budget = limits.maxTotalDiffChars;
    for (const c of candidates) {
        const degrade = c.rich !== null && useDiff.has(c.file.path);
        const text = c.rich && !degrade ? c.rich.text : c.diff;
        if (text.length > budget) {
            skipped.push({ path: c.file.path, reason: "本次审查总量已达上限" });
            continue;
        }
        budget -= text.length;
        selected.push({ file: c.file, text, context: c.rich && !degrade ? c.rich.mode : "diff" });
        if (degrade) degraded.push(c.file.path);
    }
    return { selected, skipped, degraded };
}
