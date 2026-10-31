const assert = require("node:assert/strict");
const { test } = require("node:test");
const { hookRuntime } = require("./support/hook-runtime.cjs");

test("button groups retain action handlers and disabled states when rerendered for larger text", () => {
  let fontScale = 1;
  const calls = [];
  const runtime = hookRuntime("src/components/ui.tsx", {
    "./theme": hookRuntime("src/components/theme.ts", {}).module,
    "./typography": { AppText: "Text", AppTextInput: "Input" },
    "react-native": {
      View: "View",
      Pressable: "Pressable",
      StyleSheet: { create: (styles) => styles },
      useWindowDimensions: () => ({ width: 320, fontScale }),
    },
    "./safe-area": {},
    "@expo/vector-icons/Ionicons": "Icon",
    "../hooks/use-month-pin": { useMonthPin: () => ({}) },
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const actions = [
    { code: "edit", label: "수정", onPress: () => calls.push("edit") },
    {
      code: "end",
      label: "종료",
      secondary: true,
      onPress: () => calls.push("end"),
    },
    {
      code: "delete",
      label: "삭제",
      danger: true,
      onPress: () => calls.push("delete"),
    },
  ];
  const render = (busy) =>
    flatten(
      runtime.render(({ ButtonGroup }) =>
        ButtonGroup({
          actions: actions.map((action) => ({ ...action, disabled: busy })),
        }),
      ),
    )
      .filter((node) => node.type === runtime.module.Button)
      .map((node) => runtime.module.Button(node.props));

  for (const scale of [1, 2]) {
    fontScale = scale;
    for (const busy of [false, true]) {
      const buttons = render(busy);
      assert.equal(buttons.length, actions.length);
      buttons.forEach((button, index) => {
        assert.equal(button.props.onPress, actions[index].onPress);
        assert.equal(button.props.disabled, busy);
        assert.deepEqual(button.props.accessibilityState, { disabled: busy });
        assert.equal(
          button.props.children.props.children,
          actions[index].label,
        );
      });
    }
  }
  assert.deepEqual(calls, []);
  render(false).forEach((button) => button.props.onPress());
  assert.deepEqual(calls, ["edit", "end", "delete"]);
});
