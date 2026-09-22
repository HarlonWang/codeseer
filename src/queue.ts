/** Backoff before each retry; a send that still fails after the last one throws. */
const RETRY_DELAYS_MS = [250, 500, 1000];

/**
 * `Queue.send` with retries: Queues answers "overloaded, back off" (error 10250) now and then, and GitHub never
 * redelivers a webhook on its own, so a dropped send is a PR that silently gets no review.
 */
export async function enqueue<T>(queue: Queue<T>, message: T, sleep: (ms: number) => Promise<void> = wait): Promise<void> {
    for (let attempt = 0; ; attempt++) {
        try {
            await queue.send(message);
            return;
        } catch (e) {
            const delay = RETRY_DELAYS_MS[attempt];
            if (delay === undefined) throw e;
            console.warn(`queue send failed (attempt ${attempt + 1}), retrying in ${delay} ms: ${e instanceof Error ? e.message : String(e)}`);
            await sleep(delay);
        }
    }
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
