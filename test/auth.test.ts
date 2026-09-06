import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appJwt } from "../src/github/auth";

function b64urlDecode(s: string): Buffer {
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

describe("appJwt", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

    for (const format of ["pkcs1", "pkcs8"] as const) {
        it(`signs RS256 with a ${format} PEM that the public key verifies`, async () => {
            const pem = privateKey.export({ type: format, format: "pem" }) as string;
            const jwt = await appJwt("12345", pem);
            const [h, p, sig] = jwt.split(".");
            expect(JSON.parse(b64urlDecode(h).toString())).toEqual({ alg: "RS256", typ: "JWT" });
            const payload = JSON.parse(b64urlDecode(p).toString());
            expect(payload.iss).toBe("12345");
            expect(payload.exp - payload.iat).toBe(600);
            const verifier = createVerify("RSA-SHA256").update(`${h}.${p}`);
            expect(verifier.verify(publicKey, b64urlDecode(sig))).toBe(true);
        });
    }

    it("accepts the escaped-newline form wrangler secrets tend to produce", async () => {
        const pem = (privateKey.export({ type: "pkcs1", format: "pem" }) as string).replace(/\n/g, "\\n");
        const jwt = await appJwt("1", pem);
        expect(jwt.split(".")).toHaveLength(3);
    });
});
