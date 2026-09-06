import { describe, expect, it } from "vitest";
import { composeReviewBody, partitionFindings, toReviewComments } from "../src/review/report";
import { ignoreReason } from "../src/review/ignore";
import { selectFiles } from "../src/review/select";
import { parseDiff } from "../src/review/diff";

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
            carried: [{ threadId: "t2", path: "b.ts", line: 5, comment: "still open" }],
            overflow: [{ path: "c.ts", line: 99, severity: "medium", comment: "somewhere" }],
            skipped: [{ path: "package-lock.json", reason: "lock 文件" }],
        });
        expect(body).toContain("**上轮意见**：2 条，已处理 1 条，待处理 1 条");
        expect(body).toContain("- `b.ts:5` still open");
        expect(body).toContain("### 其他意见");
        expect(body).toContain("`c.ts:99` **[建议]** somewhere");
        expect(body).toContain("`package-lock.json`：lock 文件");
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
        const { selected, skipped } = selectFiles(files, { maxFileDiffLines: 2, maxTotalDiffChars: 1000 });
        expect(selected.map((s) => s.file.path)).toEqual(["s.ts"]);
        expect(skipped[0].reason).toContain("diff 超过 2 行");
        const tight = selectFiles(files, { maxFileDiffLines: 10, maxTotalDiffChars: 40 });
        expect(tight.selected.map((s) => s.file.path)).toEqual(["s.ts"]);
        expect(tight.skipped[0].reason).toBe("本次审查总量已达上限");
    });
});
