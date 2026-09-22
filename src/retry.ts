/** 退避重试：GitHub 与 Queues 的临时 5xx / 限流都靠这几次退避吸收，跨过去的才是真失败。 */
const RETRY_DELAYS_MS = [250, 500, 1000];

export async function retrying<T>(
    op: () => Promise<T>,
    onRetry: (attempt: number, delayMs: number, e: unknown) => void,
    sleep: (ms: number) => Promise<void> = wait,
): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await op();
        } catch (e) {
            const delay = RETRY_DELAYS_MS[attempt];
            if (delay === undefined) throw e;
            onRetry(attempt + 1, delay, e);
            await sleep(delay);
        }
    }
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
