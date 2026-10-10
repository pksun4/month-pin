import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { LedgerEntry } from "../data/models";
import { useMonthPin } from "./use-month-pin";

export function useLedgerMonth(month: string) {
  const { loadLedgerMonth, expenses, methods } = useMonthPin();
  const [data, setData] = useState<{
    month: string;
    entries: LedgerEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let current = true;
      setLoading(true);
      setError(null);
      void loadLedgerMonth(month)
        .then((entries) => {
          if (current) setData({ month, entries });
        })
        .catch(() => {
          if (current)
            setError("월별 내역을 불러오지 못했어요. 다시 시도해 주세요.");
        })
        .finally(() => {
          if (current) setLoading(false);
        });
      return () => {
        current = false;
      };
      // Refresh snapshots after template changes or an explicit retry while focused.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [month, loadLedgerMonth, expenses, methods, attempt]),
  );
  return {
    entries: data?.month === month ? data.entries : [],
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
