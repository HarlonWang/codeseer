import type { ReviewJob } from "./env";
import type { Severity } from "./review/model";

export interface TrackedFinding {
    threadId: string;
    path: string;
    line: number;
    comment: string;
    severity?: Severity;
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

/** 死信消费者拿不到抛出的异常，只拿得到原消息，失败原因得由消费者自己存一手。 */
const FAILURE_TTL_SECONDS = 6 * 3600;
const MAX_REASON_CHARS = 300;

function failureKey(job: ReviewJob): string {
    return `fail:${stateKey(job.owner, job.repo, job.number)}@${job.headSha}`;
}

export async function recordFailure(kv: KVNamespace, job: ReviewJob, reason: string): Promise<void> {
    await kv.put(failureKey(job), reason.slice(0, MAX_REASON_CHARS), { expirationTtl: FAILURE_TTL_SECONDS });
}

export async function takeFailure(kv: KVNamespace, job: ReviewJob): Promise<string | null> {
    const key = failureKey(job);
    const reason = await kv.get(key);
    if (reason !== null) await kv.delete(key);
    return reason;
}
