import type { Messages } from "./messages";

const LOCK_FILES = new Set([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "bun.lock",
    "Cargo.lock",
    "Gemfile.lock",
    "poetry.lock",
    "Pipfile.lock",
    "composer.lock",
    "go.sum",
    "gradle.lockfile",
    "Podfile.lock",
    "Package.resolved",
]);

const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|icns|bmp|pdf|zip|jar|aar|apk|ipa|so|dylib|dll|exe|ttf|otf|woff2?|mp[34]|mov|keystore|jks)$/i;
const GENERATED = /(^|\/)(dist|build|out|node_modules|vendor|third_party|__snapshots__|\.gradle|\.idea)\//;
const GENERATED_FILE = /(\.min\.(js|css)|\.map|\.snap|\.pb\.go|\.pb\.swift|_pb2\.py|\.g\.dart|\.generated\.[a-z]+|\.lock)$/i;

export function ignoreReason(path: string, m: Messages): string | null {
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (LOCK_FILES.has(name) || /\.lock$/.test(name)) return m.lockFile;
    if (BINARY_EXT.test(name)) return m.binaryAsset;
    if (GENERATED.test(path)) return m.generatedDir;
    if (GENERATED_FILE.test(name)) return m.generatedFile;
    return null;
}
