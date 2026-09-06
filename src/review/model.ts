import type { Env } from "../env";

export type Severity = "high" | "medium" | "low";

export interface ModelFinding {
    path: string;
    line: number;
    severity: Severity;
    comment: string;
}

export interface ModelOutput {
    summary: string;
    findings: ModelFinding[];
    resolved: number[];
}

export interface ModelUsage {
    inputTokens: number;
    outputTokens: number;
}

const SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        summary: { type: "string" },
        findings: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    path: { type: "string" },
                    line: { type: "integer" },
                    severity: { type: "string", enum: ["high", "medium", "low"] },
                    comment: { type: "string" },
                },
                required: ["path", "line", "severity", "comment"],
            },
        },
        resolved: { type: "array", items: { type: "integer" } },
    },
    required: ["summary", "findings", "resolved"],
};

interface ResponsesResult {
    status: string;
    error?: { message: string } | null;
    incomplete_details?: { reason: string } | null;
    usage?: { input_tokens: number; output_tokens: number };
    output?: { type: string; content?: { type: string; text?: string }[] }[];
}

export async function callModel(env: Env, system: string, user: string): Promise<{ output: ModelOutput; usage: ModelUsage }> {
    const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: env.OPENAI_MODEL,
            reasoning: { effort: env.OPENAI_REASONING_EFFORT || "medium" },
            input: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            text: { format: { type: "json_schema", name: "review", strict: true, schema: SCHEMA } },
        }),
        signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as ResponsesResult;
    if (data.status !== "completed") {
        throw new Error(`openai status ${data.status}: ${data.error?.message ?? data.incomplete_details?.reason ?? "unknown"}`);
    }
    const text = data.output
        ?.filter((o) => o.type === "message")
        .flatMap((o) => o.content ?? [])
        .find((c) => c.type === "output_text")?.text;
    if (!text) throw new Error("openai: empty output");
    const output = JSON.parse(text) as ModelOutput;
    return {
        output,
        usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
    };
}
