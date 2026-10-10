import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSQLiteContext } from "expo-sqlite";
import * as repository from "../data/database";
import * as ledgerRepository from "../data/ledger";
import type {
  Expense,
  ExpenseInput,
  MethodInput,
  MethodKind,
  PaymentMethod,
  LedgerEntry,
} from "../data/models";

interface Store {
  expenses: Expense[];
  methods: PaymentMethod[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  saveExpense: (
    input: ExpenseInput,
    id?: number,
    effectiveDate?: string,
  ) => Promise<void>;
  saveMethod: (input: MethodInput, id?: number) => Promise<void>;
  deleteExpense: (id: number) => Promise<void>;
  deleteMethod: (id: number) => Promise<void>;
  reorderMethods: (kind: MethodKind, ids: readonly number[]) => Promise<void>;
  reorderExpenses: (ids: readonly number[]) => Promise<void>;
  loadLedgerMonth: (month: string) => Promise<LedgerEntry[]>;
  saveLedgerAmount: (id: number, amount: number | null) => Promise<void>;
}

const Context = createContext<Store | null>(null);

export function MonthPinProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const databaseQueue = useRef<Promise<void>>(Promise.resolve());
  const runDatabase = useCallback(
    <T,>(action: () => Promise<T>): Promise<T> => {
      const next = databaseQueue.current.then(action, action);
      databaseQueue.current = next.then(
        () => {},
        () => {},
      );
      return next;
    },
    [],
  );
  const loadLedgerMonth = useCallback(
    (month: string) =>
      runDatabase(() => ledgerRepository.loadLedgerMonth(db, month)),
    [db, runDatabase],
  );
  const refresh = useCallback(async () => {
    try {
      const [nextExpenses, nextMethods] = await Promise.all([
        repository.readExpenses(db),
        repository.readMethods(db),
      ]);
      setExpenses(nextExpenses);
      setMethods(nextMethods);
      setError(null);
    } catch (cause) {
      setError("저장한 데이터를 불러오지 못했어요. 다시 시도해 주세요.");
      throw cause;
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch(() => {});
  }, [refresh]);

  async function mutate(action: () => Promise<void>) {
    if (saving.current) throw new Error("저장이 끝난 후 다시 시도해 주세요.");
    saving.current = true;
    setBusy(true);
    try {
      await runDatabase(async () => {
        await action();
        // The write succeeded; a failed reload must not invite duplicate retries.
        await refresh().catch(() => {});
      });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <Context.Provider
      value={{
        expenses,
        methods,
        loading,
        error,
        busy,
        refresh,
        saveExpense: (input, id, effectiveDate) =>
          mutate(() => repository.saveExpense(db, input, id, effectiveDate)),
        saveMethod: (input, id) =>
          mutate(() => repository.saveMethod(db, input, id)),
        deleteExpense: (id) => mutate(() => repository.deleteExpense(db, id)),
        deleteMethod: (id) => mutate(() => repository.deleteMethod(db, id)),
        reorderMethods: (kind, ids) =>
          mutate(() => repository.reorderMethods(db, kind, ids)),
        reorderExpenses: (ids) =>
          mutate(() => repository.reorderExpenses(db, ids)),
        loadLedgerMonth,
        saveLedgerAmount: (id, amount) =>
          mutate(() => ledgerRepository.saveLedgerAmount(db, id, amount)),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useMonthPin() {
  const store = useContext(Context);
  if (!store) throw new Error("MonthPinProvider가 필요합니다.");
  return store;
}
