const assert = require("node:assert/strict");
const { test } = require("node:test");
const { hookRuntime } = require("./support/hook-runtime.cjs");

const flatten = (node) =>
  Array.isArray(node)
    ? node.flatMap(flatten)
    : node && typeof node === "object"
      ? [node, ...flatten(node.props?.children)]
      : [];

test("detail dialogs close through backdrop, close button or back, block closing while busy and expand within one native modal", () => {
  let closed = 0;
  const runtime = hookRuntime("src/components/ui.tsx", {
    "./theme": hookRuntime("src/components/theme.ts", {}).module,
    "./typography": { AppText: "Text", AppTextInput: "Input" },
    "react-native": {
      View: "View",
      Modal: "Modal",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      KeyboardAvoidingView: "KeyboardAvoidingView",
      Keyboard: { dismiss: () => {} },
      Platform: { OS: "ios" },
      StyleSheet: { create: (styles) => styles },
      useWindowDimensions: () => ({ width: 320, height: 568, fontScale: 2 }),
    },
    "react-native-safe-area-context": {
      SafeAreaProvider: "SafeAreaProvider",
      SafeAreaView: "SafeAreaView",
      useSafeAreaInsets: () => ({ top: 20, bottom: 16, left: 0, right: 0 }),
    },
    "@expo/vector-icons/Ionicons": "Icon",
    "../hooks/use-month-pin": { useMonthPin: () => ({}) },
  });
  const render = (presentation, busy = false) =>
    runtime.render(({ FormModal }) =>
      FormModal({
        presentation,
        title: "고정비 상세",
        children: "내용",
        busy,
        onClose: () => closed++,
      }),
    );
  for (const busy of [false, true]) {
    const modal = render("dialog", busy);
    assert.equal(modal.props.transparent, true);
    modal.props.onRequestClose();
    const dialog = flatten(modal).find(
      (node) => node.type?.name === "DialogContent",
    );
    const nodes = flatten(dialog.type(dialog.props));
    const buttons = nodes.filter((node) => node.type === "Pressable");
    assert.equal(buttons.length, 2);
    buttons.forEach((button) => {
      assert.equal(button.props.disabled, busy);
      button.props.onPress();
    });
    nodes
      .find((node) => node.props?.accessibilityViewIsModal)
      .props.onAccessibilityEscape();
    assert.equal(closed, 4);
    assert.ok(nodes.some((node) => node.type === "ScrollView"));
  }
  const form = render("full_screen");
  assert.equal(form.props.transparent, true);
  assert.ok(flatten(form).some((node) => node.type === "KeyboardAvoidingView"));
  assert.ok(!flatten(form).some((node) => node.type?.name === "DialogContent"));
});

test("fixed-expense details and ending use dialogs; registration, editing and renewal retain full-screen forms", () => {
  const expense = {
    id: 1,
    name: "월세",
    amountTypeCode: "fixed",
    categoryCode: "living",
    amount: 650000,
    chargeDay: 25,
    methodId: null,
    startMonth: "2026-01",
    endMonth: null,
  };
  const runtime = hookRuntime("src/components/expense-list-view.tsx", {
    "react-native": {
      View: "View",
      StyleSheet: { create: (styles) => styles },
    },
    "./typography": { AppText: "Text" },
    "./provider-icon": { ProviderIcon: "ProviderIcon" },
    "./reorderable-list": { ReorderableList: "List" },
    "./expense-row": { ExpenseRow: "ExpenseRow" },
    "./expense-form": { ExpenseForm: "ExpenseForm" },
    "./expense-end-form": { ExpenseEndForm: "ExpenseEndForm" },
    "./select-popover": { SelectPopover: "SelectPopover" },
    "./list-controls": {
      ListTabs: "ListTabs",
      RegisterButton: "RegisterButton",
      ListSummary: "ListSummary",
      ListToolbar: "ListToolbar",
      ListReorderButton: "ListReorderButton",
      listStyles: {},
    },
    "./ui": {
      Header: "Header",
      FormModal: "FormModal",
      ButtonGroup: "ButtonGroup",
      s: {},
      colors: {},
    },
    "../hooks/use-month-pin": {
      useMonthPin: () => ({
        expenses: [expense],
        endedExpenses: [],
        methods: [],
        busy: false,
      }),
    },
    "../utils/expenses": {
      filterExpenses: (items) => items,
      sortExpenses: (items) => items,
      monthlyTotal: () => 650000,
      expenseAmountLabel: () => "650,000원",
      methodLabel: () => "결제수단 미지정",
    },
    "../utils/ledger": { formatMonth: (month) => month },
    "../data/expense-types": {
      EXPENSE_CATEGORY_FILTERS: [{ code: "all", label: "전체" }],
      EXPENSE_STATUS_OPTIONS: [],
      EXPENSE_SORT_OPTIONS: [],
      getExpenseCategory: () => ({ label: "생활" }),
      getExpenseAmountType: () => ({ label: "고정" }),
    },
  });
  const render = () =>
    flatten(
      runtime.render(({ ExpenseListView }) =>
        ExpenseListView({ active: true, viewSwitcher: null }),
      ),
    );
  const modal = () => render().find((node) => node.type === "FormModal");
  const open = (item = expense) => {
    const list = render().find((node) => node.type === "List");
    flatten(list.props.renderItem({ item, isActive: false, getIndex: () => 0 }))
      .find((node) => node.type === "ExpenseRow")
      .props.onPress();
  };
  const header = flatten(
    render().find((node) => node.type === "List").props.ListHeaderComponent,
  ).find((node) => node.type === "Header");
  const register = flatten(header.props.action).find(
    (node) => node.type === "RegisterButton",
  );
  register.props.onPress();
  assert.equal(modal().props.presentation, "full_screen");
  modal().props.onClose();
  for (const [item, code, formType] of [
    [expense, "edit", "ExpenseForm"],
    [expense, "end", "ExpenseEndForm"],
    [{ ...expense, endMonth: "2026-09" }, "renew", "ExpenseForm"],
  ]) {
    open(item);
    assert.equal(modal().props.presentation, "dialog");
    render()
      .find((node) => node.type === "ButtonGroup")
      .props.actions.find((action) => action.code === code)
      .onPress();
    assert.equal(
      modal().props.presentation,
      code === "end" ? "dialog" : "full_screen",
    );
    assert.ok(render().some((node) => node.type === formType));
    modal().props.onClose();
    assert.equal(modal(), undefined);
  }
});
