import { describe, expect, it } from "vitest";
import { composeReviewBody, partitionFindings, toReviewComments } from "../src/review/report";
import { ignoreReason } from "../src/review/ignore";
import { selectFiles, wantsSource } from "../src/review/select";
import { parseDiff } from "../src/review/diff";
import type { Limits } from "../src/env";

const limits = (over: Partial<Limits>): Limits => ({ maxFileDiffLines: 10, maxTotalDiffChars: 1000, fullFileMaxLines: 1000, contextWindowLines: 150, ...over });

describe("partitionFindings", () => {
    it("keeps findings on diff lines inline and overflows the rest", () => {
        const valid = new Map([["a.ts", new Set([1, 2, 3])]]);
        const { inline, overflow } = partitionFindings(
            [
                { path: "a.ts", line: 2, severity: "high", comment: "x" },
                { path: "a.ts", line: 9, severity: "low", comment: "y" },
                { path: "b.ts", line: 1, severity: "low", comment: "z" },
                { path: "a.ts", line: 1, severity: "low", comment: "   " },
            ],
            valid,
        );
        expect(inline.map((f) => f.line)).toEqual([2]);
        expect(overflow.map((f) => `${f.path}:${f.line}`)).toEqual(["a.ts:9", "b.ts:1"]);
    });

    it("merges findings on the same line into one comment", () => {
        const comments = toReviewComments([
            { path: "a.ts", line: 2, severity: "high", comment: "one" },
            { path: "a.ts", line: 2, severity: "low", comment: "two" },
        ]);
        expect(comments).toHaveLength(1);
        expect(comments[0].body).toBe("**[严重]** one\n\n**[细节]** two");
    });
});

describe("composeReviewBody", () => {
    it("reports previous findings and skipped files", () => {
        const judged = [{ threadId: "t1", path: "a.ts", line: 2, comment: "fix me" }];
        const body = composeReviewBody({
            mode: "incremental",
            fromSha: "aaaaaaa1",
            headSha: "bbbbbbb2",
            model: "m",
            summary: "改了点东西",
            judged,
            resolved: judged,
            resolveFailed: judged,
            carried: [{ threadId: "t2", path: "b.ts", line: 5, comment: "still open" }],
            overflow: [{ path: "c.ts", line: 99, severity: "medium", comment: "somewhere" }],
            skipped: [{ path: "package-lock.json", reason: "lock 文件" }],
            degraded: [{ path: "big.kt", reason: "本次审查总量已达上限" }],
        });
        expect(body).toContain("**上轮意见**：2 条，已处理 1 条，待处理 1 条");
        expect(body).toContain("- `b.ts:5` still open");
        expect(body).toContain("标记 resolved 失败");
        expect(body).toContain("### 其他意见");
        expect(body).toContain("`c.ts:99` **[建议]** somewhere");
        expect(body).toContain("`package-lock.json`：lock 文件");
        expect(body).toContain("### 只按 diff 审查的文件");
        expect(body).toContain("- `big.kt`：本次审查总量已达上限");
        expect(body).toContain("增量 aaaaaaa..bbbbbbb");
    });
});

describe("ignore and select", () => {
    it("classifies ignored paths", () => {
        expect(ignoreReason("package-lock.json")).toBe("lock 文件");
        expect(ignoreReason("gradle/wrapper/gradle-wrapper.jar")).toBe("二进制资源");
        expect(ignoreReason("web/dist/app.js")).toBe("生成或第三方目录");
        expect(ignoreReason("lib/x.min.js")).toBe("生成文件");
        expect(ignoreReason("src/main.kt")).toBeNull();
    });

    it("applies per-file and total limits", () => {
        const big = ["diff --git a/big.ts b/big.ts", "--- a/big.ts", "+++ b/big.ts", "@@ -0,0 +1,3 @@", "+1", "+2", "+3"].join("\n");
        const small = ["diff --git a/s.ts b/s.ts", "--- a/s.ts", "+++ b/s.ts", "@@ -0,0 +1 @@", "+x"].join("\n");
        const files = parseDiff(`${big}\n${small}\n`);
        const { selected, skipped } = selectFiles(files, limits({ maxFileDiffLines: 2 }));
        expect(selected.map((s) => s.file.path)).toEqual(["s.ts"]);
        expect(skipped[0].reason).toContain("diff 超过 2 行");
        const tight = selectFiles(files, limits({ maxTotalDiffChars: 40 }));
        expect(tight.selected.map((s) => s.file.path)).toEqual(["s.ts"]);
        expect(tight.skipped[0].reason).toBe("本次审查总量已达上限");
    });

    const modified = (path: string) =>
        [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, "@@ -2,1 +2,1 @@", "-old", "+new"].join("\n");
    const source = (n: number) => Array.from({ length: n }, (_, i) => (i === 1 ? "new" : `l${i + 1}`)).join("\n");

    it("attaches full source to modified code files only", () => {
        const files = parseDiff(`${modified("a.kt")}\n${modified("README.md")}\n`);
        expect(wantsSource(files[0], limits({}))).toBe(true);
        expect(wantsSource(files[1], limits({}))).toBe(false);
        const { selected, degraded } = selectFiles(files, limits({}), new Map([["a.kt", source(5)], ["README.md", source(5)]]));
        expect(selected.map((s) => [s.file.path, s.context])).toEqual([
            ["a.kt", "full"],
            ["README.md", "diff"],
        ]);
        expect(selected[0].text).toContain("    5   l5");
        expect(degraded).toEqual([]);
    });

    it("falls back to diff when the source does not match the hunk", () => {
        const files = parseDiff(`${modified("a.kt")}\n`);
        const { selected, degraded } = selectFiles(files, limits({}), new Map([["a.kt", "x\ny\nz"]]));
        expect(selected[0].context).toBe("diff");
        expect(degraded).toEqual([{ path: "a.kt", reason: "文件内容与 diff 不符" }]);
        expect(selectFiles(files, limits({})).degraded).toEqual([{ path: "a.kt", reason: "源文件未拉到" }]);
    });

    it("does not degrade a file whose full text is no longer than its diff", () => {
        const whole = ["diff --git a/w.kt b/w.kt", "--- a/w.kt", "+++ b/w.kt", "@@ -1,2 +1,2 @@", "-a", "-b", "+x", "+y"].join("\n");
        const files = parseDiff(`${whole}\n`);
        const sources = new Map([["w.kt", "x\ny\n"]]);
        const roomy = selectFiles(files, limits({}), sources);
        expect(roomy.selected[0].context).toBe("full");
        const tight = selectFiles(files, limits({ maxTotalDiffChars: roomy.selected[0].text.length - 1 }), sources);
        expect(tight.selected).toEqual([]);
        expect(tight.degraded).toEqual([]);
        expect(tight.skipped[0].reason).toBe("本次审查总量已达上限");
    });

    it("degrades the largest full files first when over the total budget", () => {
        const files = parseDiff(`${modified("small.kt")}\n${modified("big.kt")}\n`);
        const sources = new Map([["small.kt", source(5)], ["big.kt", source(40)]]);
        const roomy = selectFiles(files, limits({}), sources);
        expect(roomy.selected.map((s) => s.context)).toEqual(["full", "full"]);
        const total = roomy.selected.reduce((sum, s) => sum + s.text.length, 0);
        const tight = selectFiles(files, limits({ maxTotalDiffChars: total - 1 }), sources);
        expect(tight.selected.map((s) => [s.file.path, s.context])).toEqual([
            ["small.kt", "full"],
            ["big.kt", "diff"],
        ]);
        expect(tight.degraded).toEqual([{ path: "big.kt", reason: "本次审查总量已达上限" }]);
        expect(tight.skipped).toEqual([]);
    });
});
