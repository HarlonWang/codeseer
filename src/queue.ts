import { retrying } from "./retry";

/**
 * `Queue.send` with retries: Queues answers "overloaded, back off" (error 10250) now and then, and GitHub never
 * redelivers a webhook on its own, so a dropped send is a PR that silently gets no review.
 */
export async function enqueue<T>(queue: Queue<T>, message: T, sleep?: (ms: number) => Promise<void>): Promise<void> {
    await retrying(
        () => queue.send(message),
        (attempt, delay, e) => console.warn(`queue send failed (attempt ${attempt}), retrying in ${delay} ms: ${e instanceof Error ? e.message : String(e)}`),
        { sleep },
    );
}
