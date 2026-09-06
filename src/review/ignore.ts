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

export function ignoreReason(path: string): string | null {
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (LOCK_FILES.has(name) || /\.lock$/.test(name)) return "lock 文件";
    if (BINARY_EXT.test(name)) return "二进制资源";
    if (GENERATED.test(path)) return "生成或第三方目录";
    if (GENERATED_FILE.test(name)) return "生成文件";
    return null;
}
