const assert = require("node:assert/strict");
const { test } = require("node:test");
const { setImmediate } = require("node:timers/promises");
const { hookRuntime } = require("./support/hook-runtime.cjs");

function backupFixture() {
  const calls = [];
  let finishWrite;
  let failWrite;
  const written = new Promise((resolve, reject) => {
    finishWrite = resolve;
    failWrite = reject;
  });
  const file = {
    uri: "file:///cache/backup.json",
    exists: true,
    size: 0,
    create: () => calls.push("create"),
    write: async (text) => {
      calls.push("write");
      await written;
      file.size = Buffer.byteLength(text);
      calls.push("written");
    },
    delete: () => {
      file.exists = false;
      calls.push("delete");
    },
  };
  const { module } = hookRuntime("src/utils/backup-file.ts", {
    "expo-file-system": {
      File: function () {
        return file;
      },
      Paths: { cache: "file:///cache" },
    },
    "expo-sharing": {
      isAvailableAsync: async () => true,
      shareAsync: async (uri) => {
        assert.equal(uri, file.uri);
        assert.ok(file.size > 0);
        calls.push("share");
      },
    },
    "expo-document-picker": {},
    "../data/backup": { MAX_BACKUP_BYTES: 20 * 1024 * 1024 },
  });
  return { save: module.saveBackupFile, calls, finishWrite, failWrite, file };
}

test("SDK 58 backup export waits for the completed file before sharing and keeps the successful cache copy", async () => {
  const fixture = backupFixture();
  const saving = fixture.save('{"tables":{}}', "backup.json");
  await setImmediate();
  assert.deepEqual(fixture.calls, ["create", "write"]);
  fixture.finishWrite();
  await saving;
  assert.deepEqual(fixture.calls, ["create", "write", "written", "share"]);
  assert.equal(fixture.file.exists, true);
});

test("SDK 58 backup write failures are caught, never shared, and clean only the temporary file", async () => {
  const fixture = backupFixture();
  const saving = fixture.save("{}", "backup.json");
  const rejected = assert.rejects(saving, /disk full/);
  await setImmediate();
  fixture.failWrite(new Error("disk full"));
  await rejected;
  assert.deepEqual(fixture.calls, ["create", "write", "delete"]);
  assert.equal(fixture.file.exists, false);
});

function safeAreaFixture(os) {
  return hookRuntime("src/components/safe-area.tsx", {
    "react-native": {
      Platform: { OS: os },
      View: "View",
      StyleSheet: {
        flatten: (style) => Object.assign({}, ...[style].flat(Infinity)),
      },
    },
    "react-native-safe-area-context": {
      SafeAreaProvider: "NativeProvider",
      SafeAreaView: "NativeView",
      useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    },
  }).module;
}

test("web safe areas use browser insets even with Router zero measurements and preserve the chosen edges and existing padding", () => {
  const safe = safeAreaFixture("web");
  assert.equal(safe.SafeAreaProvider({ children: "screen" }), "screen");
  const ref = { current: null };
  const view = safe.SafeAreaView.render(
    {
      edges: ["top", "left", "right"],
      style: [{ padding: 12 }, { paddingTop: 4 }],
      children: "screen",
    },
    ref,
  );
  assert.equal(view.type, "View");
  assert.equal(view.props.ref, ref);
  const style = Object.assign({}, ...view.props.style.flat(Infinity));
  assert.equal(style.paddingTop, "calc(4px + env(safe-area-inset-top, 0px))");
  assert.equal(
    style.paddingLeft,
    "calc(12px + env(safe-area-inset-left, 0px))",
  );
  assert.equal(style.paddingBottom, undefined);
  assert.equal(
    safe.safeAreaPadding({ top: 0, right: 0, bottom: 0, left: 0 }, 22)
      .paddingBottom,
    "calc(22px + env(safe-area-inset-bottom, 0px))",
  );
});

test("native safe areas keep the provider, view, ref and measured padding", () => {
  const safe = safeAreaFixture("ios");
  assert.equal(
    safe.SafeAreaProvider({ children: "screen" }).type,
    "NativeProvider",
  );
  const ref = { current: null };
  const view = safe.SafeAreaView.render(
    { edges: ["top"], style: { flex: 1 } },
    ref,
  );
  assert.equal(view.type, "NativeView");
  assert.equal(view.props.ref, ref);
  assert.deepEqual(view.props.edges, ["top"]);
  assert.deepEqual(
    safe.safeAreaPadding({ top: 47, right: 0, bottom: 34, left: 0 }, 22),
    { paddingTop: 69, paddingRight: 22, paddingBottom: 56, paddingLeft: 22 },
  );
});
