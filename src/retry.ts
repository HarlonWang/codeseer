/** 入队用：webhook 入口有 10 秒预算，吸收 Queues 的瞬时过载就够。 */
export const QUICK_RETRIES = [250, 500, 1000];

/** 收尾用：consumer 是分钟级的，多等几秒换 check run 不残留在 in_progress。 */
export const PATIENT_RETRIES = [500, 1000, 2000, 4000];

export interface RetryOptions {
    delays?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
}

export async function retrying<T>(
    op: () => Promise<T>,
    onRetry: (attempt: number, delayMs: number, e: unknown) => void,
    { delays = QUICK_RETRIES, sleep = wait }: RetryOptions = {},
): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await op();
        } catch (e) {
            const delay = delays[attempt];
            if (delay === undefined) throw e;
            onRetry(attempt + 1, delay, e);
            await sleep(delay);
        }
    }
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
