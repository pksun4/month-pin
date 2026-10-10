import { Text, View } from 'react-native';
import { Header, Screen, s } from '../../components/ui';

export default function SettingsScreen() {
  return <Screen><Header title="설정" description="MonthPin 사용 안내" />
    <View style={s.card}><Text style={s.sectionTitle}>기본 정보</Text><View style={s.between}><Text style={s.body}>통화</Text><Text style={s.caption}>대한민국 원 (KRW)</Text></View><View style={s.between}><Text style={s.body}>버전</Text><Text style={s.caption}>1.0.0 · 첫 버전</Text></View></View>
    <View style={s.card}><Text style={s.sectionTitle}>데이터 저장</Text><Text style={s.body}>입력한 고정비와 결제수단은 이 기기에 저장돼요. 앱을 다시 열어도 유지돼요.</Text><Text style={s.caption}>현재 별도 백업과 기기 간 동기화는 제공하지 않아요. 앱을 삭제하거나 앱 데이터를 지우면 기록이 사라질 수 있어요.</Text></View>
    <View style={s.card}><Text style={s.sectionTitle}>결제 일정 안내</Text><Text style={s.body}>고정비의 결제일과 카드 대금 출금일은 별도로 관리해요. 29~31일이 없는 달에는 마지막 날을 예상 결제일로 표시해요.</Text><Text style={s.caption}>은행·카드사 자동 연동과 결제 알림은 아직 제공하지 않아요. 실제 승인·출금 여부는 직접 확인해 주세요.</Text></View>
  </Screen>;
}
