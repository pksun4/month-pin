const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const ts = require("typescript");

// Deterministic hook lifecycle for async data tests; no native UI is simulated.
exports.hookRuntime = function hookRuntime(path, mocks) {
  const slots = [];
  let cursor = 0;
  let focused = true;
  const pending = new Map();
  const changed = (a, b) =>
    !a || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  function effect(callback, deps, focusOnly = false) {
    const index = cursor++;
    const slot = slots[index];
    if (changed(slot?.deps, deps)) {
      slots[index] = { ...slot, deps, callback, focusOnly };
      pending.set(index, slots[index]);
    }
  }
  const react = {
    ...require("react"),
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        slots[index] = {
          value: typeof initial === "function" ? initial() : initial,
        };
        slots[index].set = (next) => {
          slots[index].value =
            typeof next === "function" ? next(slots[index].value) : next;
        };
      }
      return [slots[index].value, slots[index].set];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps))
        slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    useEffect: effect,
  };
  const module = { exports: {} };
  const source = ts.transpileModule(
    readFileSync(join(__dirname, "../..", path), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  new Function("module", "exports", "require", source)(
    module,
    module.exports,
    (name) => {
      if (name === "react") return react;
      if (name === "expo-router")
        return {
          useFocusEffect: (callback) => effect(callback, [callback], true),
        };
      if (Object.hasOwn(mocks, name)) return mocks[name];
      return require(name);
    },
  );
  return {
    module: module.exports,
    render(callback) {
      cursor = 0;
      return callback(module.exports);
    },
    flush() {
      for (const [index, slot] of pending) {
        pending.delete(index);
        slot.cleanup?.();
        slot.cleanup = !slot.focusOnly || focused ? slot.callback() : undefined;
      }
    },
    focus(next) {
      if (focused === next) return;
      focused = next;
      for (const slot of slots) {
        if (!slot.focusOnly) continue;
        slot.cleanup?.();
        slot.cleanup = next ? slot.callback() : undefined;
      }
    },
  };
};
