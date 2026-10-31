import { type ViewInstance } from "react-native";
import type { MethodKind } from "../data/models";
import {
  BANK_PROVIDERS,
  CARD_PROVIDERS,
  type ProviderCode,
} from "../data/providers";
import { FormSelect } from "./form-select";
import { ProviderIcon } from "./provider-icon";
import type { Ref } from "react";

export function ProviderSelect({
  kind,
  value,
  onChange,
  disabled = false,
  required,
  error,
  onBlur,
  controlRef,
}: {
  kind: MethodKind;
  value: ProviderCode | null;
  onChange: (value: ProviderCode) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  onBlur?: () => void;
  controlRef?: Ref<ViewInstance>;
}) {
  const providers = kind === "bank" ? BANK_PROVIDERS : CARD_PROVIDERS;
  return (
    <FormSelect<ProviderCode>
      label={kind === "bank" ? "은행" : "카드사"}
      placeholder={kind === "bank" ? "은행 선택" : "카드사 선택"}
      value={value}
      options={providers.map((provider) => ({
        code: provider.code,
        label: provider.name,
        icon: <ProviderIcon code={provider.code} size={24} />,
      }))}
      inlineLabel
      onChange={onChange}
      disabled={disabled}
      required={required}
      error={error}
      onBlur={onBlur}
      controlRef={controlRef}
    />
  );
}
