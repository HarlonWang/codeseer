export class GitHubError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

export class GitHubClient {
    constructor(private readonly token: string) {}

    async rest<T>(method: string, path: string, options: { body?: unknown; accept?: string } = {}): Promise<T> {
        const res = await fetch(`https://api.github.com${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: options.accept ?? "application/vnd.github+json",
                "User-Agent": "codeseer",
                ...(options.body ? { "Content-Type": "application/json" } : {}),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        if (!res.ok) throw new GitHubError(res.status, `${method} ${path} -> ${res.status}: ${await res.text()}`);
        if (options.accept && !options.accept.includes("json")) return (await res.text()) as T;
        return (await res.json()) as T;
    }

    async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
        const res = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json",
                "User-Agent": "codeseer",
            },
            body: JSON.stringify({ query, variables }),
        });
        if (!res.ok) throw new GitHubError(res.status, `graphql -> ${res.status}: ${await res.text()}`);
        const data = (await res.json()) as { data?: T; errors?: { message: string }[] };
        if (data.errors?.length) throw new GitHubError(200, `graphql: ${data.errors.map((e) => e.message).join("; ")}`);
        return data.data as T;
    }
}
