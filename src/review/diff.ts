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

    for (const raw of text.split("\n")) {
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

export function annotate(file: DiffFile): string {
    const out: string[] = [];
    for (const h of file.hunks) {
        out.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
        for (const l of h.lines) {
            const no = l.newNo === null ? "" : String(l.newNo);
            const sign = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
            out.push(`${no.padStart(5)} ${sign} ${l.content}`);
        }
    }
    return out.join("\n");
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
