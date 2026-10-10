import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            <Text style={styles.title}>MonthPin</Text>
            <Text style={styles.description}>
                매달 나가는 돈을 한눈에
            </Text>

            <View style={styles.card}>
                <Text style={styles.label}>월 고정비 합계</Text>
                <Text style={styles.amount}>0원</Text>
            </View>

            <Text style={styles.empty}>
                아직 등록된 고정비가 없어요.
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F6F7FB',
        paddingHorizontal: 24,
        paddingTop: 80,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#202438',
    },
    description: {
        marginTop: 8,
        fontSize: 16,
        color: '#717789',
    },
    card: {
        marginTop: 32,
        padding: 24,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
    },
    label: {
        fontSize: 15,
        color: '#717789',
    },
    amount: {
        marginTop: 12,
        fontSize: 36,
        fontWeight: '700',
        color: '#536DFE',
    },
    empty: {
        marginTop: 32,
        textAlign: 'center',
        fontSize: 15,
        color: '#717789',
    },
});