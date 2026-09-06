const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

export async function verifySignature(secret: string, body: string, header: string | null): Promise<boolean> {
    if (!header || !header.startsWith("sha256=")) return false;
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
    const given = header.slice("sha256=".length);
    if (!/^[0-9a-f]+$/i.test(given) || given.length !== mac.length * 2) return false;
    return constantTimeEqual(mac, hexToBytes(given.toLowerCase()));
}

export interface PullRequestEvent {
    action: string;
    installation?: { id: number };
    repository: { name: string; owner: { login: string } };
    pull_request: {
        number: number;
        draft: boolean;
        state: string;
        head: { sha: string };
        user: { login: string; type: string };
    };
}

const TRIGGER_ACTIONS = new Set(["opened", "synchronize", "ready_for_review"]);

export function triggerReason(event: string, payload: PullRequestEvent): { skip: string } | { ok: true } {
    if (event !== "pull_request") return { skip: `event ${event}` };
    if (!TRIGGER_ACTIONS.has(payload.action)) return { skip: `action ${payload.action}` };
    if (payload.pull_request.draft) return { skip: "draft" };
    if (payload.pull_request.state !== "open") return { skip: "not open" };
    if (payload.pull_request.user.type === "Bot") return { skip: "bot author" };
    if (!payload.installation) return { skip: "no installation" };
    return { ok: true };
}
