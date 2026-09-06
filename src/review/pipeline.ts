import { limitsOf, type Env, type ReviewJob } from "../env";
import { appJwt, installationToken } from "../github/auth";
import { GitHubClient } from "../github/client";
import { PullRequestApi, type ReviewThread } from "../github/pr";
import { loadState, saveState, stateKey, type TrackedFinding } from "../state";
import { parseDiff, remapOldLine, rightSideLines, touchesOldLine, type DiffFile } from "./diff";
import { callModel } from "./model";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { composeReviewBody, partitionFindings, toReviewComments } from "./report";
import { selectFiles } from "./select";

export class SkipReview extends Error {}

export async function runReview(job: ReviewJob, env: Env): Promise<void> {
    const tag = `${job.owner}/${job.repo}#${job.number}@${job.headSha.slice(0, 7)}`;
    const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);
    const token = await installationToken(jwt, job.installationId);
    const api = new PullRequestApi(new GitHubClient(token), job.owner, job.repo);

    const pr = await api.get(job.number);
    if (pr.state !== "open") throw new SkipReview(`${tag}: PR ${pr.state}`);
    if (pr.headSha !== job.headSha) throw new SkipReview(`${tag}: head moved to ${pr.headSha.slice(0, 7)}`);

    const key = stateKey(job.owner, job.repo, job.number);
    const state = await loadState(env.STATE, key);
    if (state?.lastReviewedSha === job.headSha) throw new SkipReview(`${tag}: already reviewed`);

    const fullFiles = parseDiff(await api.diff(job.number));
    const fullByPath = new Map(fullFiles.map((f) => [f.path, f]));

    let incremental: DiffFile[] | null = null;
    if (state) {
        const text = await api.compareDiff(state.lastReviewedSha, job.headSha);
        if (text !== null) incremental = parseDiff(text).filter((f) => fullByPath.has(f.path));
    }
    const mode = incremental ? "incremental" : "full";
    const fromSha = incremental ? state!.lastReviewedSha : null;

    const { selected, skipped } = selectFiles(incremental ?? fullFiles, limitsOf(env));

    const { carried, toJudge } = await splitPreviousFindings(api, job.number, state?.findings ?? [], incremental);

    if (selected.length === 0 && toJudge.length === 0) {
        console.log(`${tag}: nothing to review (${mode})`);
        await saveState(env.STATE, key, { lastReviewedSha: job.headSha, findings: carried });
        return;
    }

    const user = buildUserPrompt({ owner: job.owner, repo: job.repo, pr, mode, fromSha, files: selected, toJudge });
    const { output, usage } = await callModel(env, SYSTEM_PROMPT, user);
    console.log(`${tag}: model ${env.OPENAI_MODEL} in=${usage.inputTokens} out=${usage.outputTokens} findings=${output.findings.length}`);

    const validLines = new Map<string, Set<number>>();
    for (const f of fullFiles) validLines.set(f.path, rightSideLines(f));
    const { inline, overflow } = partitionFindings(output.findings, validLines);

    const fresh = await api.get(job.number);
    if (fresh.headSha !== job.headSha) throw new SkipReview(`${tag}: superseded by ${fresh.headSha.slice(0, 7)}`);

    const resolvedIdx = new Set(output.resolved);
    const resolved: TrackedFinding[] = [];
    const stillOpen: TrackedFinding[] = [];
    toJudge.forEach((f, i) => (resolvedIdx.has(i) ? resolved : stillOpen).push(f));
    for (const f of resolved) await api.resolveThread(f.threadId);

    const body = composeReviewBody({
        mode,
        fromSha,
        headSha: job.headSha,
        model: env.OPENAI_MODEL,
        summary: output.summary,
        judged: toJudge,
        resolved,
        carried,
        overflow,
        skipped,
    });
    const comments = toReviewComments(inline);
    const review = await api.createReview(job.number, job.headSha, body, comments);

    const threads = (await api.listReviewThreads(job.number)).filter((t) => t.reviewId === review.nodeId);
    const tracked = trackNewFindings(comments, threads);
    await saveState(env.STATE, key, {
        lastReviewedSha: job.headSha,
        findings: [...carried, ...remapStillOpen(stillOpen, incremental), ...tracked],
    });
    console.log(`${tag}: posted ${comments.length} inline, resolved ${resolved.length}, carried ${carried.length + stillOpen.length}`);
}

async function splitPreviousFindings(
    api: PullRequestApi,
    number: number,
    previous: TrackedFinding[],
    incremental: DiffFile[] | null,
): Promise<{ carried: TrackedFinding[]; toJudge: TrackedFinding[] }> {
    if (previous.length === 0) return { carried: [], toJudge: [] };
    const threads = new Map((await api.listReviewThreads(number)).map((t) => [t.id, t]));
    const carried: TrackedFinding[] = [];
    const toJudge: TrackedFinding[] = [];
    for (const f of previous) {
        const t = threads.get(f.threadId);
        if (!t || t.isResolved) continue;
        const file = incremental?.find((x) => x.path === f.path);
        if (file && touchesOldLine(file, f.line)) toJudge.push(f);
        else carried.push(file ? { ...f, line: remapOldLine(file, f.line) } : f);
    }
    return { carried, toJudge };
}

function remapStillOpen(findings: TrackedFinding[], incremental: DiffFile[] | null): TrackedFinding[] {
    if (!incremental) return findings;
    return findings.map((f) => {
        const file = incremental.find((x) => x.path === f.path);
        return file && file.status !== "deleted" ? { ...f, line: remapOldLine(file, f.line) } : f;
    });
}

function trackNewFindings(comments: { path: string; line: number; body: string }[], threads: ReviewThread[]): TrackedFinding[] {
    const out: TrackedFinding[] = [];
    for (const c of comments) {
        const t = threads.find((x) => x.path === c.path && x.line === c.line);
        if (t) out.push({ threadId: t.id, path: c.path, line: c.line, comment: c.body });
    }
    return out;
}
