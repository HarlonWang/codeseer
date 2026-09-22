import type { GitHubClient } from "./client";

/** 不随 REVIEW_LANGUAGE 变：分支保护和 pr-review.sh 按 name 认这个检查项，翻译一次等于换了一个检查项。 */
export const CHECK_NAME = "CodeSeer review";

export type CheckConclusion = "success" | "failure" | "skipped";

const MAX_TITLE_CHARS = 255;

export class ChecksApi {
    constructor(
        private readonly gh: GitHubClient,
        private readonly owner: string,
        private readonly repo: string,
    ) {}

    async start(headSha: string, title: string): Promise<number> {
        const run = await this.gh.rest<{ id: number }>("POST", `/repos/${this.owner}/${this.repo}/check-runs`, {
            body: {
                name: CHECK_NAME,
                head_sha: headSha,
                status: "in_progress",
                started_at: new Date().toISOString(),
                output: output(title, ""),
            },
        });
        return run.id;
    }

    async finish(id: number, conclusion: CheckConclusion, title: string, summary: string): Promise<void> {
        await this.gh.rest("PATCH", `/repos/${this.owner}/${this.repo}/check-runs/${id}`, {
            body: {
                status: "completed",
                conclusion,
                completed_at: new Date().toISOString(),
                output: output(title, summary),
            },
        });
    }
}

function output(title: string, summary: string): { title: string; summary: string } {
    return { title: clamp(title, MAX_TITLE_CHARS), summary };
}

export function clamp(s: string, n: number): string {
    const one = s.replace(/\s+/g, " ").trim();
    return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}
