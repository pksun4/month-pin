import { useRef, useState } from "react";
import { Platform, View } from "react-native";
import { AppText as Text } from "./typography";
import { ButtonGroup, FormModal, colors, s } from "./ui";
import { useMonthPin } from "../hooks/use-month-pin";
import { parseBackup, type Backup } from "../data/backup";
import { pickBackupFile, saveBackupFile } from "../utils/backup-file";

export function DataBackup() {
  const { busy, exportBackup, restoreBackup } = useMonthPin();
  const working = useRef(false);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<Backup | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    if (working.current || busy) return;
    working.current = true;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "다시 시도해 주세요.");
    } finally {
      working.current = false;
      setPending(false);
    }
  }

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>데이터 백업</Text>
      <Text style={s.body}>
        몬스핀 기록을 파일로 저장하고 다른 기기로 옮길 수 있어요. 기존 기록을
        보호하기 위해 데이터가 없는 앱에서만 불러올 수 있어요.
      </Text>
      <ButtonGroup
        actions={[
          {
            code: "import",
            label: "백업 불러오기",
            secondary: true,
            disabled: pending || busy,
            onPress: () =>
              void run(async () => {
                const text = await pickBackupFile();
                if (text !== null) setPreview(parseBackup(text));
              }),
          },
          {
            code: "export",
            label: "백업 내보내기",
            disabled: pending || busy,
            onPress: () =>
              void run(async () => {
                const backup = await exportBackup();
                const filename = `monthpin-backup-${backup.createdAt.replace(/[:.]/g, "-")}.json`;
                await saveBackupFile(JSON.stringify(backup), filename);
                setMessage(
                  Platform.OS === "web"
                    ? "다운로드한 파일을 확인해 주세요."
                    : "파일 앱 등 선택한 저장 위치에서 백업 파일을 확인해 주세요.",
                );
              }),
          },
        ]}
      />
      <Text style={s.caption}>
        백업에는 금액 등 개인 정보가 포함돼요. 본인만 접근할 수 있는 곳에 보관해
        주세요.
      </Text>
      {message && (
        <Text accessibilityLiveRegion="polite" style={s.caption}>
          {message}
        </Text>
      )}
      {error && !preview && (
        <Text
          accessibilityRole="alert"
          style={[s.caption, { color: colors.red }]}
        >
          {error}
        </Text>
      )}
      {preview && (
        <FormModal
          title="백업 불러오기"
          presentation="dialog"
          busy={pending || busy}
          onClose={() => {
            if (!working.current) {
              setPreview(null);
              setError(null);
            }
          }}
        >
          <Text style={s.body}>
            아래 백업을 이 기기에 불러올까요? 원래 기기의 기록은 그대로
            유지돼요.
          </Text>
          <Text style={s.caption}>
            백업 날짜 · {new Date(preview.createdAt).toLocaleString("ko-KR")}
          </Text>
          <Text style={s.body}>
            결제수단 {preview.tables.payment_methods.length}개 · 고정비{" "}
            {preview.tables.expenses.length}개{"\n"}월별 고정비{" "}
            {preview.tables.ledger_entries.length}건 · 카드 혜택{" "}
            {preview.tables.monthly_card_benefits.length}건{"\n"}연말정산{" "}
            {preview.tables.monthly_tax_spending.length}개월 · 이자 수입{" "}
            {preview.tables.interest_income_entries.length}건
          </Text>
          <Text style={s.caption}>
            종료·삭제한 항목의 이력과 확정 금액도 함께 옮겨요. 두 기기 간 자동
            동기화는 지원하지 않아요.
          </Text>
          {error && (
            <Text
              accessibilityRole="alert"
              style={[s.caption, { color: colors.red }]}
            >
              {error}
            </Text>
          )}
          <ButtonGroup
            actions={[
              {
                code: "cancel",
                label: "취소",
                secondary: true,
                disabled: pending || busy,
                onPress: () => {
                  setPreview(null);
                  setError(null);
                },
              },
              {
                code: "restore",
                label: pending ? "불러오는 중" : "불러오기",
                disabled: pending || busy,
                onPress: () =>
                  void run(async () => {
                    await restoreBackup(preview);
                    setPreview(null);
                    setMessage("백업한 기록을 불러왔어요.");
                  }),
              },
            ]}
          />
        </FormModal>
      )}
    </View>
  );
}
