export type LineKind = "ctx" | "add" | "del";

export interface DiffLine {
    kind: LineKind;
    content: string;
    newNo: number | null;
}

export interface Hunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
}

export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface DiffFile {
    path: string;
    oldPath: string;
    status: FileStatus;
    binary: boolean;
    hunks: Hunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function stripPrefix(p: string): string {
    return p.startsWith("a/") || p.startsWith("b/") ? p.slice(2) : p;
}

export function parseDiff(text: string): DiffFile[] {
    const files: DiffFile[] = [];
    let file: DiffFile | null = null;
    let hunk: Hunk | null = null;
    let oldNo = 0;
    let newNo = 0;

    for (const raw of splitSource(text)) {
        if (raw.startsWith("diff --git ")) {
            const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(raw);
            file = { path: m ? m[2] : raw, oldPath: m ? m[1] : raw, status: "modified", binary: false, hunks: [] };
            files.push(file);
            hunk = null;
            continue;
        }
        if (!file) continue;
        if (raw.startsWith("new file mode")) file.status = "added";
        else if (raw.startsWith("deleted file mode")) file.status = "deleted";
        else if (raw.startsWith("rename from ")) file.status = "renamed";
        else if (raw.startsWith("rename to ")) file.path = raw.slice("rename to ".length);
        else if (raw.startsWith("--- ") && !hunk) {
            if (raw !== "--- /dev/null") file.oldPath = stripPrefix(raw.slice(4));
        } else if (raw.startsWith("+++ ") && !hunk) {
            if (raw !== "+++ /dev/null") file.path = stripPrefix(raw.slice(4));
        } else if (raw.startsWith("Binary files ") || raw.startsWith("GIT binary patch")) file.binary = true;
        else if (raw.startsWith("@@")) {
            const m = HUNK_HEADER.exec(raw);
            if (!m) continue;
            hunk = {
                oldStart: Number(m[1]),
                oldLines: m[2] === undefined ? 1 : Number(m[2]),
                newStart: Number(m[3]),
                newLines: m[4] === undefined ? 1 : Number(m[4]),
                lines: [],
            };
            file.hunks.push(hunk);
            oldNo = hunk.oldStart;
            newNo = hunk.newStart;
        } else if (hunk) {
            if (raw.startsWith("\\")) continue;
            const sign = raw[0];
            const content = raw.slice(1);
            if (sign === "+") hunk.lines.push({ kind: "add", content, newNo: newNo++ });
            else if (sign === "-") {
                hunk.lines.push({ kind: "del", content, newNo: null });
                oldNo++;
            } else if (sign === " " || raw === "") {
                hunk.lines.push({ kind: "ctx", content, newNo: newNo++ });
                oldNo++;
            }
        }
    }
    return files;
}

export function rightSideLines(file: DiffFile): Set<number> {
    const set = new Set<number>();
    for (const h of file.hunks) for (const l of h.lines) if (l.newNo !== null) set.add(l.newNo);
    return set;
}

export function changedLineCount(file: DiffFile): number {
    let n = 0;
    for (const h of file.hunks) for (const l of h.lines) if (l.kind !== "ctx") n++;
    return n;
}

const SIGN: Record<LineKind, string> = { add: "+", del: "-", ctx: " " };
const ELLIPSIS = "  ...";

function formatLine(no: number | null, sign: string, content: string): string {
    return `${(no === null ? "" : String(no)).padStart(5)} ${sign} ${content}`;
}

export function annotate(file: DiffFile): string {
    const out: string[] = [];
    for (const h of file.hunks) {
        out.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
        for (const l of h.lines) out.push(formatLine(l.newNo, SIGN[l.kind], l.content));
    }
    return out.join("\n");
}

export function splitSource(text: string): string[] {
    const lines = text.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
}

export type ContextMode = "full" | "window" | "diff";

export interface ContextOptions {
    fullFileMaxLines: number;
    contextWindowLines: number;
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const r of sorted) {
        const last = out[out.length - 1];
        if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
        else out.push([r[0], r[1]]);
    }
    return out;
}

/**
 * 把 diff 的改动标记铺到文件全文上；文件超过 fullFileMaxLines 时只保留每个 hunk 上下
 * contextWindowLines 行的窗口。source 与 hunk 的新侧内容对不上（不是同一版本）时返回 null。
 */
export function annotateWithSource(
    file: DiffFile,
    source: string[],
    opts: ContextOptions,
): { text: string; mode: Exclude<ContextMode, "diff"> } | null {
    const n = source.length;
    if (n === 0 || file.hunks.length === 0) return null;
    for (const h of file.hunks) for (const l of h.lines) if (l.newNo !== null && source[l.newNo - 1] !== l.content) return null;

    const rendered: { anchor: number; text: string }[] = [];
    let next = 1;
    for (const h of [...file.hunks].sort((a, b) => a.newStart - b.newStart)) {
        // 纯删除 hunk 的 newLines 为 0，newStart 指删除点之前那一行
        const first = h.newLines === 0 ? h.newStart + 1 : h.newStart;
        while (next < first && next <= n) {
            rendered.push({ anchor: next, text: formatLine(next, " ", source[next - 1]) });
            next++;
        }
        let anchor = Math.max(h.newStart, 1);
        for (const l of h.lines) {
            if (l.newNo !== null) {
                anchor = l.newNo;
                next = l.newNo + 1;
            }
            rendered.push({ anchor, text: formatLine(l.newNo, SIGN[l.kind], l.content) });
        }
    }
    while (next <= n) {
        rendered.push({ anchor: next, text: formatLine(next, " ", source[next - 1]) });
        next++;
    }

    const mode = n <= opts.fullFileMaxLines ? "full" : "window";
    const ranges: [number, number][] =
        mode === "full"
            ? [[1, n]]
            : mergeRanges(
                  file.hunks.map((h) => [
                      Math.max(1, h.newStart - opts.contextWindowLines),
                      Math.min(n, h.newStart + Math.max(h.newLines, 1) - 1 + opts.contextWindowLines),
                  ]),
              );

    const out: string[] = [];
    let prevEnd = 0;
    for (const [a, b] of ranges) {
        if (a > prevEnd + 1) out.push(ELLIPSIS);
        for (const r of rendered) if (r.anchor >= a && r.anchor <= b) out.push(r.text);
        prevEnd = b;
    }
    if (prevEnd < n) out.push(ELLIPSIS);
    return { text: out.join("\n"), mode };
}

export function touchesOldLine(file: DiffFile, line: number): boolean {
    if (file.status === "deleted") return true;
    return file.hunks.some((h) => {
        const end = h.oldStart + Math.max(h.oldLines, 1) - 1;
        return line >= h.oldStart && line <= end;
    });
}

export function remapOldLine(file: DiffFile, line: number): number {
    let delta = 0;
    for (const h of file.hunks) {
        if (h.oldStart + h.oldLines - 1 < line) delta += h.newLines - h.oldLines;
    }
    return line + delta;
}
