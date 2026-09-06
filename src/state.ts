export interface TrackedFinding {
    threadId: string;
    path: string;
    line: number;
    comment: string;
}

export interface PrState {
    lastReviewedSha: string;
    findings: TrackedFinding[];
}

const TTL_SECONDS = 90 * 24 * 3600;

export function stateKey(owner: string, repo: string, number: number): string {
    return `${owner}/${repo}#${number}`;
}

export async function loadState(kv: KVNamespace, key: string): Promise<PrState | null> {
    return kv.get<PrState>(key, "json");
}

export async function saveState(kv: KVNamespace, key: string, state: PrState): Promise<void> {
    await kv.put(key, JSON.stringify(state), { expirationTtl: TTL_SECONDS });
}
