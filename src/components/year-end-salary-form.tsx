import { useRef, useState } from "react";
import { type TextInput, View } from "react-native";
import { AppText as Text } from "./typography";
import type { YearEndTaxSettings } from "../data/models";
import { useMonthPin } from "../hooks/use-month-pin";
import { formatAmountInput, money } from "../utils/expenses";
import { cardSpendingTarget, parseGrossSalary } from "../utils/year-end-tax";
import { Button, Field, FieldMessage, s, useFormNavigation } from "./ui";

export function YearEndSalaryForm({
  settings,
  onClose,
}: {
  settings: YearEndTaxSettings;
  onClose: () => void;
}) {
  const { saveYearEndTaxSalary, busy } = useMonthPin();
  const [value, setValue] = useState(() =>
    settings.grossSalary === null
      ? ""
      : formatAmountInput(String(settings.grossSalary)),
  );
  const [touched, setTouched] = useState(false);
  const [saveError, setSaveError] = useState("");
  const inputRef = useRef<TextInput>(null);
  const containerRef = useRef<View>(null);
  const savingRef = useRef(false);
  const reveal = useFormNavigation();
  const salary = parseGrossSalary(value);
  const error =
    salary === null
      ? "총급여를 0원부터 9,999,999,999원까지 입력해 주세요."
      : "";
  const target = cardSpendingTarget(salary);

  async function save() {
    if (busy || savingRef.current) return;
    setTouched(true);
    setSaveError("");
    if (salary === null) {
      const focus = () => inputRef.current?.focus();
      if (reveal) reveal(containerRef.current, focus);
      else focus();
      return;
    }
    savingRef.current = true;
    try {
      await saveYearEndTaxSalary(settings.year, salary);
      onClose();
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      savingRef.current = false;
    }
  }
  return (
    <>
      <Text style={s.body}>
        {settings.year}년의 연간 총급여를 입력해 주세요. 비과세 급여는 제외해
        주세요.
      </Text>
      <View ref={containerRef} collapsable={false}>
        <Field
          label="총급여 (비과세 제외)"
          value={value}
          onChangeText={(next) => {
            setValue((previous) => formatAmountInput(next, previous));
            setSaveError("");
          }}
          onBlur={() => setTouched(true)}
          placeholder="연간 총급여 (원)"
          numeric
          required
          maxLength={13}
          disabled={busy}
          error={touched ? error : ""}
          controlRef={inputRef}
        />
      </View>
      <Text style={s.caption} accessibilityLiveRegion="polite">
        목표금액 {target === null ? "—" : money(target)} · 총급여의 25%
      </Text>
      <FieldMessage error={saveError} />
      <Button
        label={busy ? "저장 중…" : "저장"}
        disabled={busy}
        onPress={() => void save()}
      />
    </>
  );
}
