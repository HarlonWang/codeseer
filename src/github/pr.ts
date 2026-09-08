import { GitHubClient, GitHubError } from "./client";

export interface PullRequest {
    number: number;
    title: string;
    body: string;
    state: string;
    draft: boolean;
    headSha: string;
    baseSha: string;
}

export interface ReviewComment {
    path: string;
    line: number;
    body: string;
}

export type ReviewEvent = "COMMENT" | "APPROVE";

export interface ReviewThread {
    id: string;
    isResolved: boolean;
    isOutdated: boolean;
    path: string;
    line: number | null;
    reviewId: string | null;
    body: string;
}

const DIFF_ACCEPT = "application/vnd.github.diff";

export class PullRequestApi {
    constructor(
        private readonly gh: GitHubClient,
        private readonly owner: string,
        private readonly repo: string,
    ) {}

    private get base(): string {
        return `/repos/${this.owner}/${this.repo}`;
    }

    async get(number: number): Promise<PullRequest> {
        const pr = await this.gh.rest<{
            number: number;
            title: string;
            body: string | null;
            state: string;
            draft: boolean;
            head: { sha: string };
            base: { sha: string };
        }>("GET", `${this.base}/pulls/${number}`);
        return {
            number: pr.number,
            title: pr.title,
            body: pr.body ?? "",
            state: pr.state,
            draft: pr.draft,
            headSha: pr.head.sha,
            baseSha: pr.base.sha,
        };
    }

    async diff(number: number): Promise<string> {
        return this.gh.rest<string>("GET", `${this.base}/pulls/${number}`, { accept: DIFF_ACCEPT });
    }

    async fileContent(path: string, ref: string): Promise<string> {
        const encoded = path.split("/").map(encodeURIComponent).join("/");
        return this.gh.rest<string>("GET", `${this.base}/contents/${encoded}?ref=${ref}`, { accept: "application/vnd.github.raw" });
    }

    async compareDiff(from: string, to: string): Promise<string | null> {
        try {
            return await this.gh.rest<string>("GET", `${this.base}/compare/${from}...${to}`, { accept: DIFF_ACCEPT });
        } catch (e) {
            if (e instanceof GitHubError && (e.status === 404 || e.status === 422)) return null;
            throw e;
        }
    }

    async createReview(
        number: number,
        commitId: string,
        body: string,
        comments: ReviewComment[],
        event: ReviewEvent = "COMMENT",
    ): Promise<{ nodeId: string }> {
        const review = await this.gh.rest<{ node_id: string }>("POST", `${this.base}/pulls/${number}/reviews`, {
            body: {
                commit_id: commitId,
                body,
                event,
                comments: comments.map((c) => ({ path: c.path, line: c.line, side: "RIGHT", body: c.body })),
            },
        });
        return { nodeId: review.node_id };
    }

    async listReviewThreads(number: number): Promise<ReviewThread[]> {
        const out: ReviewThread[] = [];
        let after: string | null = null;
        for (;;) {
            const data: ThreadsPage = await this.gh.graphql<ThreadsPage>(THREADS_QUERY, {
                owner: this.owner,
                name: this.repo,
                pr: number,
                after,
            });
            const page = data.repository.pullRequest.reviewThreads;
            for (const t of page.nodes) {
                const first = t.comments.nodes[0];
                out.push({
                    id: t.id,
                    isResolved: t.isResolved,
                    isOutdated: t.isOutdated,
                    path: t.path,
                    line: t.line,
                    reviewId: first?.pullRequestReview?.id ?? null,
                    body: first?.body ?? "",
                });
            }
            if (!page.pageInfo.hasNextPage) return out;
            after = page.pageInfo.endCursor;
        }
    }

    async resolveThread(threadId: string): Promise<void> {
        await this.gh.graphql(RESOLVE_MUTATION, { id: threadId });
    }
}

interface ThreadsPage {
    repository: {
        pullRequest: {
            reviewThreads: {
                pageInfo: { hasNextPage: boolean; endCursor: string | null };
                nodes: {
                    id: string;
                    isResolved: boolean;
                    isOutdated: boolean;
                    path: string;
                    line: number | null;
                    comments: { nodes: { body: string; pullRequestReview: { id: string } | null }[] };
                }[];
            };
        };
    };
}

const THREADS_QUERY = `
query($owner: String!, $name: String!, $pr: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
        pullRequest(number: $pr) {
            reviewThreads(first: 100, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                    id isResolved isOutdated path line
                    comments(first: 1) { nodes { body pullRequestReview { id } } }
                }
            }
        }
    }
}`;

const RESOLVE_MUTATION = `
mutation($id: ID!) {
    resolveReviewThread(input: { threadId: $id }) { thread { id isResolved } }
}`;
