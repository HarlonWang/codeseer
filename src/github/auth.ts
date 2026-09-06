function base64url(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemBody(pem: string): Uint8Array {
    const b64 = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function derLength(n: number): number[] {
    if (n < 0x80) return [n];
    const bytes: number[] = [];
    for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
    return [0x80 | bytes.length, ...bytes];
}

function derTag(tag: number, content: Uint8Array): Uint8Array {
    const len = derLength(content.length);
    const out = new Uint8Array(1 + len.length + content.length);
    out[0] = tag;
    out.set(len, 1);
    out.set(content, 1 + len.length);
    return out;
}

// WebCrypto 只认 PKCS#8，GitHub 下发的是 PKCS#1（BEGIN RSA PRIVATE KEY），这里补 PKCS#8 外壳
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
    const version = new Uint8Array([0x02, 0x01, 0x00]);
    const rsaAlgorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
    const key = derTag(0x04, pkcs1);
    const body = new Uint8Array(version.length + rsaAlgorithm.length + key.length);
    body.set(version, 0);
    body.set(rsaAlgorithm, version.length);
    body.set(key, version.length + rsaAlgorithm.length);
    return derTag(0x30, body);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
    const normalized = pem.replace(/\\n/g, "\n");
    const der = pemBody(normalized);
    const pkcs8 = normalized.includes("BEGIN RSA PRIVATE KEY") ? pkcs1ToPkcs8(der) : der;
    return crypto.subtle.importKey("pkcs8", pkcs8.buffer as ArrayBuffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

export async function appJwt(appId: string, pem: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const encoder = new TextEncoder();
    const header = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
    const payload = base64url(encoder.encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })));
    const signingInput = `${header}.${payload}`;
    const key = await importPrivateKey(pem);
    const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signingInput)));
    return `${signingInput}.${base64url(signature)}`;
}

export async function installationToken(jwt: string, installationId: number): Promise<string> {
    const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "codeseer",
        },
    });
    if (!res.ok) throw new Error(`installation token ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { token: string };
    return data.token;
}
