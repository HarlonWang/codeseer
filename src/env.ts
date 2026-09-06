export interface Env {
    STATE: KVNamespace;
    REVIEW_QUEUE: Queue<ReviewJob>;
    GITHUB_APP_ID: string;
    GITHUB_PRIVATE_KEY: string;
    GITHUB_WEBHOOK_SECRET: string;
    OPENAI_API_KEY: string;
    OPENAI_MODEL: string;
    OPENAI_REASONING_EFFORT: string;
    MAX_FILE_DIFF_LINES: string;
    MAX_TOTAL_DIFF_CHARS: string;
}

export interface ReviewJob {
    owner: string;
    repo: string;
    number: number;
    headSha: string;
    installationId: number;
    enqueuedAt: string;
}

export interface Limits {
    maxFileDiffLines: number;
    maxTotalDiffChars: number;
}

export function limitsOf(env: Env): Limits {
    return {
        maxFileDiffLines: Number(env.MAX_FILE_DIFF_LINES) || 800,
        maxTotalDiffChars: Number(env.MAX_TOTAL_DIFF_CHARS) || 240000,
    };
}
