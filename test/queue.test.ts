import { describe, expect, it } from "vitest";
import { enqueue } from "../src/queue";

/** A queue that fails the first [failures] sends with the Queues overload error, then accepts. */
function flaky(failures: number) {
    const sent: unknown[] = [];
    let calls = 0;
    const queue = {
        async send(message: unknown) {
            calls++;
            if (calls <= failures) throw new Error("Queue is overloaded. Please back off. (10250)");
            sent.push(message);
        },
    } as unknown as Queue<unknown>;
    return { queue, sent, calls: () => calls };
}

describe("enqueue", () => {
    it("sends once when the queue accepts", async () => {
        const q = flaky(0);
        const slept: number[] = [];
        await enqueue(q.queue, { n: 1 }, async (ms) => { slept.push(ms); });
        expect(q.sent).toEqual([{ n: 1 }]);
        expect(slept).toEqual([]);
    });

    it("backs off and retries an overloaded queue until it accepts", async () => {
        const q = flaky(2);
        const slept: number[] = [];
        await enqueue(q.queue, { n: 1 }, async (ms) => { slept.push(ms); });
        expect(q.sent).toEqual([{ n: 1 }]);
        expect(q.calls()).toBe(3);
        expect(slept).toEqual([250, 500]);
    });

    it("gives up after the last backoff and lets the error through", async () => {
        const q = flaky(Infinity);
        const slept: number[] = [];
        await expect(enqueue(q.queue, { n: 1 }, async (ms) => { slept.push(ms); })).rejects.toThrow("10250");
        expect(q.calls()).toBe(4);
        expect(slept).toEqual([250, 500, 1000]);
    });
});
