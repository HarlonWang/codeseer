import { describe, expect, it } from "vitest";
import { triggerReason, verifySignature, type PullRequestEvent } from "../src/github/webhook";

async function sign(secret: string, body: string): Promise<string> {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    return `sha256=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

describe("verifySignature", () => {
    it("accepts a valid signature and rejects tampering", async () => {
        const header = await sign("s3cret", '{"a":1}');
        expect(await verifySignature("s3cret", '{"a":1}', header)).toBe(true);
        expect(await verifySignature("s3cret", '{"a":2}', header)).toBe(false);
        expect(await verifySignature("other", '{"a":1}', header)).toBe(false);
        expect(await verifySignature("s3cret", '{"a":1}', null)).toBe(false);
        expect(await verifySignature("s3cret", '{"a":1}', "sha256=zz")).toBe(false);
    });
});

function event(over: Partial<PullRequestEvent["pull_request"]> = {}, action = "opened"): PullRequestEvent {
    return {
        action,
        installation: { id: 1 },
        repository: { name: "r", owner: { login: "o" } },
        pull_request: { number: 1, draft: false, state: "open", head: { sha: "abc" }, user: { login: "u", type: "User" }, ...over },
    };
}

describe("triggerReason", () => {
    it("reviews opened, synchronize and ready_for_review", () => {
        expect(triggerReason("pull_request", event())).toEqual({ ok: true });
        expect(triggerReason("pull_request", event({}, "synchronize"))).toEqual({ ok: true });
        expect(triggerReason("pull_request", event({}, "ready_for_review"))).toEqual({ ok: true });
    });

    it("skips drafts, bots, closed PRs and other actions", () => {
        expect(triggerReason("pull_request", event({ draft: true }))).toEqual({ skip: "draft" });
        expect(triggerReason("pull_request", event({ user: { login: "dependabot[bot]", type: "Bot" } }))).toEqual({ skip: "bot author" });
        expect(triggerReason("pull_request", event({ state: "closed" }, "synchronize"))).toEqual({ skip: "not open" });
        expect(triggerReason("pull_request", event({}, "closed"))).toEqual({ skip: "action closed" });
        expect(triggerReason("issues", event())).toEqual({ skip: "event issues" });
    });
});
