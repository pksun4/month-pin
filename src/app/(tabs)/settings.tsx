import { AppText as Text } from "../../components/typography";
import { View } from "react-native";
import { Header, Screen, s } from "../../components/ui";
import { DataBackup } from "../../components/data-backup";

export default function SettingsScreen() {
  return (
    <Screen>
      <Header title="설정" description="MonthPin 사용 안내" />
      <View style={s.card}>
        <Text style={s.sectionTitle}>기본 정보</Text>
        <View style={s.between}>
          <Text style={s.body}>통화</Text>
          <Text style={s.caption}>대한민국 원 (KRW)</Text>
        </View>
        <View style={s.between}>
          <Text style={s.body}>버전</Text>
          <Text style={s.caption}>1.0.0 · 첫 버전</Text>
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.sectionTitle}>데이터 저장</Text>
        <Text style={s.body}>
          입력한 고정비·결제수단·월별 금액은 이 기기에 저장돼요. 앱을 다시
          열어도 유지돼요.
        </Text>
        <Text style={s.caption}>
          기기 간 자동 동기화는 제공하지 않아요. 앱을 삭제하거나 브라우저
          데이터를 지우기 전에 백업해 주세요.
        </Text>
      </View>
      <DataBackup />
      <View style={s.card}>
        <Text style={s.sectionTitle}>고정비 캘린더 안내</Text>
        <Text style={s.body}>
          고정비 제목 옆 아이콘으로 목록과 캘린더를 전환할 수 있어요. 고정
          금액은 자동으로 반영돼요. 변동 항목은 매월 실제 금액을 입력하며,
          미입력 금액은 합계에 포함되지 않아요.
        </Text>
        <Text style={s.caption}>
          금액을 수정하면 변경 적용 월부터 새 금액을 반영해요. 이전 달과 직접
          입력한 실제 금액은 유지돼요. 새 고정비는 시작 월부터 표시하고, 종료한
          고정비는 마지막 반영 월까지 표시해요. 종료한 항목은 목록의 ‘종료’
          상태에서 다시 등록할 수 있어요. 삭제하면 진행 중·종료 목록에서
          제외되지만 기존 월 기록과 직접 입력한 실제 금액은 유지돼요.
        </Text>
      </View>
      <View style={s.card}>
        <Text style={s.sectionTitle}>결제 일정 안내</Text>
        <Text style={s.body}>
          고정비의 결제일과 카드 대금 출금일은 별도로 관리해요. 29~31일이 없는
          달에는 마지막 날을 예상 결제일로 표시해요.
        </Text>
        <Text style={s.caption}>
          은행·카드사 자동 연동과 결제 알림은 아직 제공하지 않아요. 실제
          승인·출금 여부는 직접 확인해 주세요.
        </Text>
      </View>
    </Screen>
  );
}
