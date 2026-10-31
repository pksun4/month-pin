const { readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

// Upstream 4.0.3 still uses RN's removed InteractionManager and RNGH 2 names.
// Apply the compatibility changes after npm ci/install, including Metro sources.
const root = dirname(
  require.resolve("react-native-draggable-flatlist/package.json"),
);
const version = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version;
if (version !== "4.0.3")
  throw new Error(
    "Review SDK 58 compatibility before updating draggable-flatlist.",
  );

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const files = ["src", "lib"].flatMap((directory) =>
  filesUnder(join(root, directory)),
);
let changed = 0;
for (const path of files.filter((file) => /\.(?:js|ts|tsx)$/.test(file))) {
  const before = readFileSync(path, "utf8");
  const after = before
    .replace(
      /import\s*\{([^}]+)\}\s*from\s*["']react-native-gesture-handler["']/g,
      (statement, names) =>
        statement.replace(
          names,
          names.replace(
            /(?<!as )\b(FlatList|ScrollView)\b/g,
            (name) => `Legacy${name} as ${name}`,
          ),
        ),
    )
    .replace(
      /(_reactNativeGestureHandler)\.(FlatList|ScrollView)\b/g,
      "$1.Legacy$2",
    )
    .replace(
      /import \{ InteractionManager \} from ["']react-native["'];?\n/g,
      "",
    )
    .replace(/^\s*InteractionManager,?\s*\n/gm, "")
    .replace(
      /(?:\b\w+\.)?InteractionManager\.runAfterInteractions/g,
      "(globalThis.requestIdleCallback ?? ((callback) => setTimeout(callback, 0)))",
    );
  if (before !== after) {
    writeFileSync(path, after);
    changed++;
  }
}
console.log(
  `SDK 58 draggable-flatlist compatibility ready (${changed} files updated).`,
);
