import { allowedOwners, jobTag, type Env, type ReviewJob } from "./env";
import { triggerReason, verifySignature, type PullRequestEvent } from "./github/webhook";
import { enqueue } from "./queue";
import { messagesOf } from "./review/messages";
import { runReview, SkipReview } from "./review/pipeline";
import { recordFailure } from "./state";
import { err, reportDeadLetter, settleCheck, startCheck } from "./status";

const DEAD_LETTER_QUEUE = "codeseer-review-dlq";

async function handleWebhook(req: Request, env: Env): Promise<Response> {
    const body = await req.text();
    if (!(await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, req.headers.get("x-hub-signature-256")))) {
        return new Response("bad signature", { status: 401 });
    }
    const event = req.headers.get("x-github-event") ?? "";
    if (event === "ping") return new Response("pong");
    const payload = JSON.parse(body) as PullRequestEvent;
    const verdict = triggerReason(event, payload, allowedOwners(env));
    if ("skip" in verdict) return new Response(`ignored: ${verdict.skip}`, { status: 202 });

    const job: ReviewJob = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        number: payload.pull_request.number,
        headSha: payload.pull_request.head.sha,
        installationId: payload.installation!.id,
        enqueuedAt: new Date().toISOString(),
    };
    // check run 要先建：消费者只能通过消息里的 id 给它收尾，入队之后再建就可能赶不上消费。
    job.checkRunId = await startCheck(env, job);
    try {
        await enqueue(env.REVIEW_QUEUE, job);
    } catch (e) {
        // GitHub does not redeliver on its own: the delivery has to be replayed from the App's Recent Deliveries
        console.error(`dropped ${jobTag(job)}: queue send failed: ${err(e)}`);
        await settleCheck(env, job, { conclusion: "failure", title: messagesOf(env.REVIEW_LANGUAGE).checkDropped, quick: true });
        return new Response("queue unavailable", { status: 503 });
    }
    return new Response("queued", { status: 202 });
}

async function handleDeadLetter(batch: MessageBatch<ReviewJob>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
        try {
            await reportDeadLetter(env, msg.body);
        } catch (e) {
            console.error(`${jobTag(msg.body)}: dead letter handling failed: ${err(e)}`);
        }
        // 死信不再重投：这里失败就只剩日志，留着消息只会把同一条反复打回
        msg.ack();
    }
}

async function handleReview(batch: MessageBatch<ReviewJob>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
        const job = msg.body;
        try {
            const outcome = await runReview(job, env);
            await settleCheck(env, job, { conclusion: "success", title: outcome.checkTitle });
            msg.ack();
        } catch (e) {
            if (e instanceof SkipReview) {
                console.log(`skip: ${e.message}`);
                await settleCheck(env, job, { conclusion: "skipped", title: e.reason });
                msg.ack();
                continue;
            }
            console.error(`review failed (attempt ${msg.attempts}): ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
            // check 留在 in_progress 等重试；重试耗尽后由死信消费者收尾并汇报这里存下的原因
            try {
                await recordFailure(env.STATE, job, err(e));
            } catch (kvError) {
                console.error(`${jobTag(job)}: record failure reason failed: ${err(kvError)}`);
            }
            msg.retry({ delaySeconds: 60 });
        }
    }
}

export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        if (req.method === "POST" && url.pathname === "/webhook") return handleWebhook(req, env);
        if (req.method === "GET" && url.pathname === "/") return new Response("CodeSeer");
        return new Response("not found", { status: 404 });
    },

    async queue(batch, env) {
        if (batch.queue === DEAD_LETTER_QUEUE) return handleDeadLetter(batch, env);
        return handleReview(batch, env);
    },
} satisfies ExportedHandler<Env, ReviewJob>;
