import { describe, expect, it } from "vitest";
import { clamp } from "../src/github/checks";
import { MESSAGES } from "../src/review/messages";
import { composeCheckTitle, type CheckTitleInput } from "../src/review/report";

const base: CheckTitleInput = {
    findings: 0,
    previousTotal: 0,
    resolved: 0,
    pending: 0,
    skipped: 0,
    approved: false,
    nothingToReview: false,
};

describe("composeCheckTitle", () => {
    it("reports the finding count on its own for a first round", () => {
        expect(composeCheckTitle({ ...base, findings: 3 }, MESSAGES["zh-CN"])).toBe("3 条意见");
        expect(composeCheckTitle({ ...base, findings: 1 }, MESSAGES.en)).toBe("1 finding");
    });

    it("adds last round's tally only when there was one", () => {
        const input = { ...base, findings: 2, previousTotal: 5, resolved: 4, pending: 1 };
        expect(composeCheckTitle(input, MESSAGES["zh-CN"])).toBe("2 条意见，上轮处理 4 条、待处理 1 条");
        expect(composeCheckTitle({ ...input, previousTotal: 0 }, MESSAGES["zh-CN"])).toBe("2 条意见");
    });

    it("spells out a clean approved round", () => {
        expect(composeCheckTitle({ ...base, approved: true }, MESSAGES["zh-CN"])).toBe("无意见，已批准");
        expect(composeCheckTitle({ ...base, approved: true }, MESSAGES.en)).toBe("no findings, approved");
    });

    it("keeps skipped files visible next to the verdict", () => {
        expect(composeCheckTitle({ ...base, findings: 1, skipped: 2 }, MESSAGES["zh-CN"])).toBe("1 条意见，2 个文件未审查");
    });

    it("says nothing was reviewable instead of reporting zero findings", () => {
        expect(composeCheckTitle({ ...base, nothingToReview: true, approved: true }, MESSAGES["zh-CN"])).toBe("本轮无可审查改动，已批准");
    });
});

describe("clamp", () => {
    it("leaves a short one-line title alone", () => {
        expect(clamp("3 条意见", 255)).toBe("3 条意见");
    });

    it("folds newlines so the title stays one line", () => {
        expect(clamp("openai 429:\n  rate limit\n", 255)).toBe("openai 429: rate limit");
    });

    it("truncates with an ellipsis at the limit", () => {
        expect(clamp("abcdef", 4)).toBe("abc…");
    });
});
