import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { CardBenefitMonth } from "../data/models";
import { useMonthPin } from "./use-month-pin";

export function useCardBenefitMonth(month: string, enabled = true) {
  const { loadCardBenefitMonth, dataRevision, busy } = useMonthPin();
  const [data, setData] = useState<{
    month: string;
    revision: number;
    attempt: number;
    snapshot: CardBenefitMonth | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!enabled || busy) return;
      let current = true;
      const request = { month, revision: dataRevision, attempt };
      setData({ ...request, snapshot: null, loading: true, error: null });
      void loadCardBenefitMonth(month)
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
              error: "카드 혜택을 불러오지 못했어요. 다시 시도해 주세요.",
            });
        });
      return () => {
        current = false;
      };
    }, [month, loadCardBenefitMonth, dataRevision, attempt, enabled, busy]),
  );
  const current =
    enabled &&
    !busy &&
    data?.month === month &&
    data.revision === dataRevision &&
    data.attempt === attempt;
  return {
    // Reject stale snapshots during render, before the focus effect runs.
    snapshot: current ? data.snapshot : null,
    loading: enabled && (!current || data.loading),
    error: current ? data.error : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
