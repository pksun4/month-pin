const assert = require("node:assert/strict");
const { test } = require("node:test");
const { hookRuntime } = require("./support/hook-runtime.cjs");

function flattenStyle(style) {
  return Array.isArray(style)
    ? Object.assign({}, ...style.map(flattenStyle))
    : style || {};
}

function flatten(node) {
  return Array.isArray(node)
    ? node.flatMap(flatten)
    : node && typeof node === "object"
      ? [node, ...flatten(node.props?.children)]
      : [];
}

function inputFixture(props = {}, forwardedRef = { current: null }) {
  const changes = [];
  const calls = [];
  const currentProps = {
    accessibilityLabel: "월 혜택 금액",
    onChangeText: (next) => {
      changes.push(next);
      if (currentProps.value !== undefined) currentProps.value = next;
    },
    ...props,
  };
  const native = {
    focus: () => calls.push("focus"),
    clear: () => calls.push("clear"),
  };
  const fontMocks = Object.fromEntries(
    [
      "Quicksand-Bold.ttf",
      "Pretendard-Regular.otf",
      "Pretendard-Medium.otf",
      "Pretendard-SemiBold.otf",
      "Pretendard-Bold.otf",
      "Pretendard-ExtraBold.otf",
    ].map((name) => [`../../assets/fonts/${name}`, name]),
  );
  const runtime = hookRuntime("src/components/typography.tsx", {
    ...fontMocks,
    "expo-font": { isLoaded: () => true },
    "@expo/vector-icons/Ionicons": "Icon",
    "./theme": hookRuntime("src/components/theme.ts", {}).module,
    "react-native": {
      Text: "Text",
      TextInput: "NativeInput",
      View: "View",
      Pressable: "Pressable",
      StyleSheet: { create: (styles) => styles, flatten: flattenStyle },
    },
  });
  const render = () =>
    flatten(
      runtime.render(({ AppTextInput }) =>
        AppTextInput.render(currentProps, forwardedRef),
      ),
    );
  const input = () => render().find((node) => node.type === "NativeInput");
  const button = () => render().find((node) => node.type === "Pressable");
  const cleanup = input().props.ref(native);
  return {
    render,
    input,
    button,
    currentProps,
    changes,
    calls,
    native,
    forwardedRef,
    cleanup,
  };
}

test("common input clears a controlled value through the existing change handler and restores focus without submitting", () => {
  let blurred = 0;
  let submitted = 0;
  const fixture = inputFixture({
    value: "1,234,567",
    onBlur: () => blurred++,
    onSubmitEditing: () => submitted++,
    keyboardType: "number-pad",
    maxLength: 11,
    clearButtonMode: "always",
    style: { fontSize: 16, fontWeight: "600" },
  });
  assert.equal(
    fixture.button().props.accessibilityLabel,
    "월 혜택 금액 지우기",
  );
  assert.equal(fixture.input().props.clearButtonMode, "never");
  assert.equal(fixture.input().props.keyboardType, "number-pad");
  assert.equal(fixture.input().props.maxLength, 11);
  assert.equal(
    flattenStyle(fixture.input().props.style).fontFamily,
    "Pretendard-SemiBold",
  );
  fixture.button().props.onPress();
  assert.deepEqual(fixture.changes, [""]);
  assert.deepEqual(fixture.calls, ["focus"]);
  assert.equal(fixture.input().props.value, "");
  assert.equal(fixture.button(), undefined);
  assert.equal(blurred, 0);
  assert.equal(submitted, 0);
  assert.equal(fixture.forwardedRef.current, fixture.native);
  fixture.cleanup();
  assert.equal(fixture.forwardedRef.current, null);
});

test("clear controls appear for nonempty editable inputs including zero and hide for empty, locked or opted-out inputs", () => {
  for (const value of ["카드 이름", "0", "25", " "])
    assert.ok(inputFixture({ value }).button(), value);
  for (const props of [
    { value: "" },
    { value: "카드", editable: false },
    { value: "카드", readOnly: true },
    { value: "카드", accessibilityState: { disabled: true } },
    { value: "메모", multiline: true },
    { value: "카드", clearable: false },
    { value: "카드", onChangeText: undefined },
  ])
    assert.equal(inputFixture(props).button(), undefined);
});

test("uncontrolled input clear updates its native value and draft, and typing after clearing shows the control again", () => {
  const fixture = inputFixture({ defaultValue: "검색어" });
  fixture.button().props.onPress();
  assert.deepEqual(fixture.calls, ["clear", "focus"]);
  assert.deepEqual(fixture.changes, [""]);
  assert.equal(fixture.button(), undefined);
  fixture.input().props.onChangeText("다음 검색");
  assert.deepEqual(fixture.changes, ["", "다음 검색"]);
  assert.ok(fixture.button());
});

test("callback refs keep exposing the native input and receive cleanup", () => {
  const assignments = [];
  const fixture = inputFixture({ value: "카드 이름" }, (input) => {
    assignments.push(input);
  });
  assert.deepEqual(assignments, [fixture.native]);
  fixture.button().props.onPress();
  assert.deepEqual(fixture.calls, ["focus"]);
  fixture.cleanup();
  assert.deepEqual(assignments, [fixture.native, null]);
});
