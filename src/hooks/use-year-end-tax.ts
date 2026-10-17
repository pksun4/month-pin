import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { YearEndTaxYear } from "../data/models";
import { useMonthPin } from "./use-month-pin";

export function useYearEndTax(year: number, enabled = true) {
  const { loadYearEndTaxYear, dataRevision, busy } = useMonthPin();
  const [data, setData] = useState<{
    year: number;
    revision: number;
    attempt: number;
    snapshot: YearEndTaxYear | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!enabled || busy) return;
      let current = true;
      const request = { year, revision: dataRevision, attempt };
      setData({ ...request, snapshot: null, loading: true, error: null });
      void loadYearEndTaxYear(year)
        .then((snapshot) => {
          if (current)
            setData({ ...request, snapshot, loading: false, error: null });
        })
        .catch(() => {
          if (current)
            setData({
              ...request,
              snapshot: null,
              loading: false,
              error: "연말정산 정보를 불러오지 못했어요. 다시 시도해 주세요.",
            });
        });
      return () => {
        current = false;
      };
    }, [year, loadYearEndTaxYear, dataRevision, attempt, enabled, busy]),
  );
  const current =
    enabled &&
    !busy &&
    data?.year === year &&
    data.revision === dataRevision &&
    data.attempt === attempt;
  return {
    snapshot: current ? data.snapshot : null,
    loading: enabled && (!current || data.loading),
    error: current ? data.error : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
