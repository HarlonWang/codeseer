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
    FULL_FILE_MAX_LINES: string;
    CONTEXT_WINDOW_LINES: string;
    APPROVE_ENABLED: string;
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
    fullFileMaxLines: number;
    contextWindowLines: number;
}

export function limitsOf(env: Env): Limits {
    return {
        maxFileDiffLines: Number(env.MAX_FILE_DIFF_LINES) || 800,
        maxTotalDiffChars: Number(env.MAX_TOTAL_DIFF_CHARS) || 240000,
        fullFileMaxLines: Number(env.FULL_FILE_MAX_LINES) || 1000,
        contextWindowLines: Number(env.CONTEXT_WINDOW_LINES) || 150,
    };
}

export function approveEnabled(env: Env): boolean {
    return env.APPROVE_ENABLED === "true";
}
