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
import * as cardBenefitRepository from "../data/card-benefits";
import * as annualRepository from "../data/annual-summary";
import * as taxRepository from "../data/year-end-tax";
import * as taxCardRepository from "../data/year-end-tax-cards";
import * as interestRepository from "../data/interest-income";
import * as backupRepository from "../data/backup";
import type { Backup } from "../data/backup";
import type {
  Expense,
  ExpenseInput,
  MethodInput,
  MethodKind,
  PaymentMethod,
  LedgerEntry,
  CardBenefitMonth,
  CardBenefitInput,
  AnnualSummary,
  YearEndTaxYear,
  YearEndTaxMonthInput,
  InterestIncomeYear,
  InterestIncomeMonthInput,
} from "../data/models";

interface Store {
  expenses: Expense[];
  endedExpenses: Expense[];
  methods: PaymentMethod[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  dataRevision: number;
  refresh: () => Promise<void>;
  exportBackup: () => Promise<Backup>;
  restoreBackup: (backup: Backup) => Promise<void>;
  saveExpense: (
    input: ExpenseInput,
    id?: number,
    effectiveMonth?: string,
    renewalSourceId?: number,
  ) => Promise<void>;
  saveMethod: (
    input: MethodInput,
    id?: number,
    effectiveMonth?: string,
  ) => Promise<void>;
  endExpense: (id: number, endMonth: string) => Promise<void>;
  deleteExpense: (id: number) => Promise<void>;
  deleteMethod: (id: number) => Promise<void>;
  reorderMethods: (kind: MethodKind, ids: readonly number[]) => Promise<void>;
  reorderExpenses: (ids: readonly number[]) => Promise<void>;
  loadLedgerMonth: (month: string) => Promise<LedgerEntry[]>;
  saveLedgerAmount: (id: number, amount: number | null) => Promise<void>;
  loadCardBenefitMonth: (month: string) => Promise<CardBenefitMonth>;
  loadAnnualSummary: (year: number) => Promise<AnnualSummary>;
  loadYearEndTaxYear: (year: number) => Promise<YearEndTaxYear>;
  loadInterestIncomeYear: (year: number) => Promise<InterestIncomeYear>;
  saveInterestIncomeMonth: (input: InterestIncomeMonthInput) => Promise<void>;
  saveYearEndTaxSalary: (year: number, grossSalary: number) => Promise<void>;
  saveYearEndTaxMonth: (entry: YearEndTaxMonthInput) => Promise<void>;
  saveYearEndTaxCards: (
    year: number,
    methodIds: readonly number[],
  ) => Promise<void>;
  saveCardBenefitMonth: (
    month: string,
    inputs: readonly CardBenefitInput[],
  ) => Promise<void>;
}

const Context = createContext<Store | null>(null);

export function MonthPinProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [endedExpenses, setEndedExpenses] = useState<Expense[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dataRevision, setDataRevision] = useState(0);
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
  const refresh = useCallback(async () => {
    try {
      const [nextExpenses, nextMethods, nextEndedExpenses] = await Promise.all([
        repository.readExpenses(db),
        repository.readMethods(db),
        repository.readExpenses(db, "ended"),
      ]);
      setExpenses(nextExpenses);
      setEndedExpenses(nextEndedExpenses);
      setMethods(nextMethods);
      setError(null);
    } catch (cause) {
      setError("저장한 데이터를 불러오지 못했어요. 다시 시도해 주세요.");
      throw cause;
    } finally {
      // Invalidate monthly snapshots even if reloading the lists after a write failed.
      setDataRevision((revision) => revision + 1);
      setLoading(false);
    }
  }, [db]);

  const loadLedgerMonth = useCallback(
    (month: string) =>
      runDatabase(() => ledgerRepository.loadLedgerMonth(db, month)),
    [db, runDatabase],
  );

  const loadCardBenefitMonth = useCallback(
    (month: string) =>
      runDatabase(() => cardBenefitRepository.loadCardBenefitMonth(db, month)),
    [db, runDatabase],
  );

  const loadAnnualSummary = useCallback(
    (year: number) =>
      runDatabase(() => annualRepository.loadAnnualSummary(db, year)),
    [db, runDatabase],
  );

  const loadYearEndTaxYear = useCallback(
    (year: number) =>
      runDatabase(() => taxRepository.loadYearEndTaxYear(db, year)),
    [db, runDatabase],
  );

  const loadInterestIncomeYear = useCallback(
    (year: number) =>
      runDatabase(() => interestRepository.loadInterestIncomeYear(db, year)),
    [db, runDatabase],
  );

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
        endedExpenses,
        methods,
        loading,
        error,
        busy,
        dataRevision,
        refresh,
        exportBackup: async () => {
          if (saving.current)
            throw new Error("저장이 끝난 후 다시 시도해 주세요.");
          saving.current = true;
          setBusy(true);
          try {
            return await runDatabase(() => backupRepository.createBackup(db));
          } finally {
            saving.current = false;
            setBusy(false);
          }
        },
        restoreBackup: (backup) =>
          mutate(() => backupRepository.restoreBackup(db, backup)),
        saveExpense: (input, id, effectiveMonth, renewalSourceId) =>
          mutate(() =>
            repository.saveExpense(
              db,
              input,
              id,
              effectiveMonth,
              renewalSourceId,
            ),
          ),
        saveMethod: (input, id, effectiveMonth) =>
          mutate(() => repository.saveMethod(db, input, id, effectiveMonth)),
        endExpense: (id, endMonth) =>
          mutate(() => repository.endExpense(db, id, endMonth)),
        deleteExpense: (id) => mutate(() => repository.deleteExpense(db, id)),
        deleteMethod: (id) => mutate(() => repository.deleteMethod(db, id)),
        reorderMethods: (kind, ids) =>
          mutate(() => repository.reorderMethods(db, kind, ids)),
        reorderExpenses: (ids) =>
          mutate(() => repository.reorderExpenses(db, ids)),
        loadLedgerMonth,
        loadCardBenefitMonth,
        loadAnnualSummary,
        loadYearEndTaxYear,
        loadInterestIncomeYear,
        saveInterestIncomeMonth: (input) =>
          mutate(() => interestRepository.saveInterestIncomeMonth(db, input)),
        saveYearEndTaxCards: (year, methodIds) =>
          mutate(() =>
            taxCardRepository.saveYearEndTaxCards(db, year, methodIds),
          ),
        saveYearEndTaxMonth: (entry) =>
          mutate(() => taxRepository.saveYearEndTaxMonth(db, entry)),
        saveYearEndTaxSalary: (year, grossSalary) =>
          mutate(() =>
            taxRepository.saveYearEndTaxSalary(db, year, grossSalary),
          ),
        saveCardBenefitMonth: (month, inputs) =>
          mutate(() =>
            cardBenefitRepository.saveCardBenefitMonth(db, month, inputs),
          ),
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
