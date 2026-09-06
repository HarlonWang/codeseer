import type { Env, ReviewJob } from "./env";
import { triggerReason, verifySignature, type PullRequestEvent } from "./github/webhook";
import { runReview, SkipReview } from "./review/pipeline";

async function handleWebhook(req: Request, env: Env): Promise<Response> {
    const body = await req.text();
    if (!(await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, req.headers.get("x-hub-signature-256")))) {
        return new Response("bad signature", { status: 401 });
    }
    const event = req.headers.get("x-github-event") ?? "";
    if (event === "ping") return new Response("pong");
    const payload = JSON.parse(body) as PullRequestEvent;
    const verdict = triggerReason(event, payload);
    if ("skip" in verdict) return new Response(`ignored: ${verdict.skip}`, { status: 202 });

    const job: ReviewJob = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        number: payload.pull_request.number,
        headSha: payload.pull_request.head.sha,
        installationId: payload.installation!.id,
        enqueuedAt: new Date().toISOString(),
    };
    await env.REVIEW_QUEUE.send(job);
    return new Response("queued", { status: 202 });
}

export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        if (req.method === "POST" && url.pathname === "/webhook") return handleWebhook(req, env);
        if (req.method === "GET" && url.pathname === "/") return new Response("CodeSeer");
        return new Response("not found", { status: 404 });
    },

    async queue(batch, env) {
        for (const msg of batch.messages) {
            try {
                await runReview(msg.body, env);
                msg.ack();
            } catch (e) {
                if (e instanceof SkipReview) {
                    console.log(`skip: ${e.message}`);
                    msg.ack();
                } else {
                    console.error(`review failed (attempt ${msg.attempts}): ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
                    msg.retry({ delaySeconds: 60 });
                }
            }
        }
    },
} satisfies ExportedHandler<Env, ReviewJob>;
