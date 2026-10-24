const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { preparePages } = require("../scripts/prepare-pages.cjs");

test("Pages output preserves SQLite bytes and icon fonts outside excluded dependency paths", () => {
  const output = mkdtempSync(join(tmpdir(), "monthpin-pages-"));
  try {
    const sqlite = join(output, "assets/node_modules/expo-sqlite/web");
    const icons = join(output, "assets/node_modules/icons");
    mkdirSync(sqlite, { recursive: true });
    mkdirSync(icons, { recursive: true });
    const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
    writeFileSync(join(sqlite, "wa-sqlite.hash.wasm"), wasm);
    writeFileSync(join(icons, "Ionicons.hash.ttf"), "font fixture");
    const redirects = readFileSync(
      join(__dirname, "../public/_redirects"),
      "utf8",
    );
    writeFileSync(join(output, "_redirects"), redirects);
    assert.equal(preparePages(output), 1);
    assert.equal(existsSync(join(output, "assets/node_modules")), false);
    const [from, to, status] = redirects.trim().split(/\s+/);
    const request = "/assets/node_modules/expo-sqlite/web/wa-sqlite.hash.wasm";
    const suffix = request.slice(from.indexOf("*"));
    const rewritten = to.replace(":splat", suffix);
    assert.equal(status, "200");
    assert.deepEqual(readFileSync(join(output, rewritten)), wasm);
    assert.equal(
      readFileSync(
        join(output, "assets/vendor/icons/Ionicons.hash.ttf"),
        "utf8",
      ),
      "font fixture",
    );
    assert.equal(preparePages(output), 1);
    writeFileSync(join(output, "_redirects"), "");
    assert.throws(() => preparePages(output), /경로 설정/);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("Pages build fails instead of deploying missing or corrupted SQLite WASM", () => {
  const output = mkdtempSync(join(tmpdir(), "monthpin-pages-"));
  try {
    assert.throws(() => preparePages(output), /WASM/);
    const vendor = join(output, "assets/vendor");
    mkdirSync(vendor, { recursive: true });
    writeFileSync(join(vendor, "invalid.wasm"), "<!DOCTYPE html>");
    assert.throws(() => preparePages(output), /WASM/);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
