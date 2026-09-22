import { describe, expect, it } from "vitest";
import { PATIENT_RETRIES, QUICK_RETRIES, retrying } from "../src/retry";

function failing(times: number) {
    let calls = 0;
    return {
        op: async () => {
            calls++;
            if (calls <= times) throw new Error(`boom ${calls}`);
            return "ok";
        },
        calls: () => calls,
    };
}

describe("retrying", () => {
    it("walks the quick delays by default", async () => {
        const slept: number[] = [];
        await expect(retrying(failing(Infinity).op, () => {}, { sleep: async (ms) => void slept.push(ms) })).rejects.toThrow();
        expect(slept).toEqual([...QUICK_RETRIES]);
    });

    it("gives the patient schedule more attempts before giving up", async () => {
        const slept: number[] = [];
        const f = failing(Infinity);
        await expect(retrying(f.op, () => {}, { delays: PATIENT_RETRIES, sleep: async (ms) => void slept.push(ms) })).rejects.toThrow();
        expect(slept).toEqual([...PATIENT_RETRIES]);
        expect(f.calls()).toBe(PATIENT_RETRIES.length + 1);
    });

    it("stops retrying as soon as the operation succeeds", async () => {
        const f = failing(2);
        const slept: number[] = [];
        await expect(retrying(f.op, () => {}, { delays: PATIENT_RETRIES, sleep: async (ms) => void slept.push(ms) })).resolves.toBe("ok");
        expect(slept).toEqual([500, 1000]);
    });
});
