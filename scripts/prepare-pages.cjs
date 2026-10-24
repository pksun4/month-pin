const {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { join, resolve } = require("node:path");

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function preparePages(directory) {
  const source = join(directory, "assets", "node_modules");
  const destination = join(directory, "assets", "vendor");
  // Pages excludes every node_modules directory, even inside exported assets.
  // Preserve the generated bundle URLs and rewrite them with public/_redirects.
  if (existsSync(source)) {
    cpSync(source, destination, { recursive: true });
    rmSync(source, { recursive: true });
  }
  const wasmFiles = existsSync(destination)
    ? filesUnder(destination).filter((path) => path.endsWith(".wasm"))
    : [];
  if (
    !wasmFiles.length ||
    wasmFiles.some(
      (path) =>
        !readFileSync(path)
          .subarray(0, 4)
          .equals(Buffer.from([0, 97, 115, 109])),
    )
  )
    throw new Error("SQLite WASM 에셋이 없거나 손상되어 웹 배포를 중단합니다.");
  const redirects = readFileSync(join(directory, "_redirects"), "utf8");
  if (
    !redirects
      .split(/\r?\n/)
      .some(
        (line) =>
          line.trim() === "/assets/node_modules/* /assets/vendor/:splat 200",
      )
  )
    throw new Error("Cloudflare 의존성 에셋 경로 설정이 필요합니다.");
  return wasmFiles.length;
}

if (require.main === module) {
  const count = preparePages(resolve(__dirname, "../dist"));
  console.log(
    `Cloudflare Pages: SQLite WASM ${count}개와 의존성 에셋 준비 완료`,
  );
}

module.exports = { preparePages };
