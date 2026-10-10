import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Expense } from '../data/models';
import { useMonthPin } from '../hooks/use-month-pin';
import { methodLabel, money } from '../utils/expenses';
import { colors, s } from './ui';

export function ExpenseRow({ expense, dateLabel, onPress }: { expense: Expense; dateLabel?: string; onPress?: () => void }) {
  const { methods } = useMonthPin();
  const method = methods.find((item) => item.id === expense.methodId);
  const content = <><View style={[s.emptyIcon, { width: 42, height: 42, borderRadius: 13, marginBottom: 0 }]}><Ionicons name={method?.kind === 'card' ? 'card-outline' : 'receipt-outline'} size={22} color={colors.blue} /></View><View style={s.flex}><Text style={[s.body, { fontWeight: '700' }]}>{expense.name}</Text><Text style={[s.caption, { marginTop: 2, fontSize: 12 }]}>{dateLabel ?? `매월 ${expense.chargeDay}일`} · {methodLabel(method)}</Text></View><Text style={[s.body, { fontWeight: '700', maxWidth: '38%' }]}>{money(expense.amount)}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${expense.name}, ${money(expense.amount)}, 상세보기`} onPress={onPress} style={({ pressed }) => [s.row, { paddingVertical: 12 }, pressed && { opacity: 0.6 }]}>{content}</Pressable> : <View style={[s.row, { paddingVertical: 10 }]}>{content}</View>;
}
