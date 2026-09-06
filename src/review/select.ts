import type { Limits } from "../env";
import { annotate, changedLineCount, type DiffFile } from "./diff";
import { ignoreReason } from "./ignore";

export interface SelectedFile {
    file: DiffFile;
    text: string;
}

export interface SkippedFile {
    path: string;
    reason: string;
}

export function selectFiles(files: DiffFile[], limits: Limits): { selected: SelectedFile[]; skipped: SkippedFile[] } {
    const selected: SelectedFile[] = [];
    const skipped: SkippedFile[] = [];
    let budget = limits.maxTotalDiffChars;
    for (const file of files) {
        const reason = ignoreReason(file.path);
        if (reason) {
            skipped.push({ path: file.path, reason });
            continue;
        }
        if (file.binary) {
            skipped.push({ path: file.path, reason: "二进制" });
            continue;
        }
        if (file.hunks.length === 0) continue;
        const changed = changedLineCount(file);
        if (changed > limits.maxFileDiffLines) {
            skipped.push({ path: file.path, reason: `diff 超过 ${limits.maxFileDiffLines} 行（${changed} 行）` });
            continue;
        }
        const text = annotate(file);
        if (text.length > budget) {
            skipped.push({ path: file.path, reason: "本次审查总量已达上限" });
            continue;
        }
        budget -= text.length;
        selected.push({ file, text });
    }
    return { selected, skipped };
}
