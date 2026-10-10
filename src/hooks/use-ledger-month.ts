import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { LedgerEntry } from "../data/models";
import { useMonthPin } from "./use-month-pin";

export function useLedgerMonth(month: string, enabled = true) {
  const { loadLedgerMonth, dataRevision, busy } = useMonthPin();
  const [data, setData] = useState<{
    month: string;
    revision: number;
    attempt: number;
    entries: LedgerEntry[];
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!enabled || busy) return;
      let current = true;
      const request = { month, revision: dataRevision, attempt };
      setData({ ...request, entries: [], loading: true, error: null });
      void loadLedgerMonth(month)
        .then((entries) => {
          if (current)
            setData({ ...request, entries, loading: false, error: null });
        })
        .catch(() => {
          if (current)
            setData({
              ...request,
              entries: [],
              loading: false,
              error: "월별 내역을 불러오지 못했어요. 다시 시도해 주세요.",
            });
        });
      return () => {
        current = false;
      };
    }, [month, loadLedgerMonth, dataRevision, attempt, enabled, busy]),
  );
  const current =
    enabled &&
    !busy &&
    data?.month === month &&
    data.revision === dataRevision &&
    data.attempt === attempt;
  return {
    // Reject stale snapshots during render, before the focus effect runs.
    entries: current ? data.entries : [],
    loading: enabled && (!current || data.loading),
    error: current ? data.error : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
