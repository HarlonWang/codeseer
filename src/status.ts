import { jobTag, type Env, type ReviewJob } from "./env";
import { appJwt, installationToken } from "./github/auth";
import { ChecksApi, clamp, type CheckConclusion } from "./github/checks";
import { GitHubClient } from "./github/client";
import { PullRequestApi } from "./github/pr";
import { retrying } from "./retry";
import { takeFailure } from "./state";
import { messagesOf } from "./review/messages";

/** 旁路汇报，每个入口自己吞掉异常：Checks 权限缺失的后果该是 PR 上少一个检查项，而不是整轮审查失败。 */
async function client(env: Env, job: ReviewJob): Promise<GitHubClient> {
    const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);
    return new GitHubClient(await installationToken(jwt, job.installationId));
}

export async function startCheck(env: Env, job: ReviewJob): Promise<number | undefined> {
    const m = messagesOf(env.REVIEW_LANGUAGE);
    try {
        const checks = new ChecksApi(await client(env, job), job.owner, job.repo);
        return await checks.start(job.headSha, m.checkStarted);
    } catch (e) {
        console.error(`${jobTag(job)}: start check failed: ${err(e)}`);
        return undefined;
    }
}

/** 收尾比建更要紧：收不掉就是 PR 上一个永远转圈的检查项，所以这一步退避重试过再认输。 */
export async function settleCheck(env: Env, job: ReviewJob, conclusion: CheckConclusion, title: string, summary = ""): Promise<void> {
    const id = job.checkRunId;
    if (id === undefined) return;
    try {
        await retrying(
            async () => {
                const checks = new ChecksApi(await client(env, job), job.owner, job.repo);
                await checks.finish(id, conclusion, title, summary);
            },
            (attempt, delay, e) => console.warn(`${jobTag(job)}: settle check failed (attempt ${attempt}), retrying in ${delay} ms: ${err(e)}`),
        );
    } catch (e) {
        console.error(`${jobTag(job)}: settle check gave up, run ${id} stays in progress: ${err(e)}`);
    }
}

/** 没有这一步，consumer 被超时打死的那轮会在 PR 顶部留一个永远转圈的检查项。 */
export async function reportDeadLetter(env: Env, job: ReviewJob): Promise<void> {
    const m = messagesOf(env.REVIEW_LANGUAGE);
    let reason = m.unknownFailure;
    try {
        reason = (await takeFailure(env.STATE, job)) ?? reason;
    } catch (e) {
        console.error(`${jobTag(job)}: read failure reason failed: ${err(e)}`);
    }
    await settleCheck(env, job, "failure", m.checkFailed(reason));
    try {
        const api = new PullRequestApi(await client(env, job), job.owner, job.repo);
        await api.comment(job.number, m.failureComment(job.headSha, clamp(reason, 300)));
    } catch (e) {
        console.error(`${jobTag(job)}: failure comment failed: ${err(e)}`);
    }
}

export function err(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
