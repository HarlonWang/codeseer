import { describe, expect, it } from "vitest";
import { annotate, changedLineCount, parseDiff, remapOldLine, rightSideLines, touchesOldLine } from "../src/review/diff";

const SAMPLE = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,4 +1,5 @@
 line1
-line2
+line2 changed
+line2 extra
 line3
 line4
@@ -10,2 +11,2 @@
 line10
-line11
+line11 changed
diff --git a/img.png b/img.png
new file mode 100644
Binary files /dev/null and b/img.png differ
diff --git a/old.ts b/new.ts
similarity index 90%
rename from old.ts
rename to new.ts
--- a/old.ts
+++ b/new.ts
@@ -1 +1 @@
-x
+y
diff --git a/gone.ts b/gone.ts
deleted file mode 100644
--- a/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-a
-b
`;

describe("parseDiff", () => {
    const files = parseDiff(SAMPLE);

    it("splits files and classifies status", () => {
        expect(files.map((f) => [f.path, f.status, f.binary])).toEqual([
            ["src/a.ts", "modified", false],
            ["img.png", "added", true],
            ["new.ts", "renamed", false],
            ["gone.ts", "deleted", false],
        ]);
    });

    it("numbers right-side lines per hunk", () => {
        const a = files[0];
        expect(a.hunks[0].lines.map((l) => [l.kind, l.newNo])).toEqual([
            ["ctx", 1],
            ["del", null],
            ["add", 2],
            ["add", 3],
            ["ctx", 4],
            ["ctx", 5],
        ]);
        expect([...rightSideLines(a)]).toEqual([1, 2, 3, 4, 5, 11, 12]);
        expect(changedLineCount(a)).toEqual(5);
    });

    it("annotates with absolute new line numbers", () => {
        const text = annotate(files[0]);
        expect(text).toContain("    1   line1");
        expect(text).toContain("      - line2");
        expect(text).toContain("    2 + line2 changed");
        expect(text).toContain("   12 + line11 changed");
    });
});

describe("old-line bookkeeping", () => {
    const [a, , , gone] = parseDiff(SAMPLE);

    it("detects whether a previous finding's line was touched", () => {
        expect(touchesOldLine(a, 2)).toBe(true);
        expect(touchesOldLine(a, 4)).toBe(true);
        expect(touchesOldLine(a, 7)).toBe(false);
        expect(touchesOldLine(a, 11)).toBe(true);
        expect(touchesOldLine(gone, 1)).toBe(true);
    });

    it("shifts untouched lines by the net delta of hunks above", () => {
        expect(remapOldLine(a, 7)).toBe(8);
        expect(remapOldLine(a, 20)).toBe(21);
    });
});
