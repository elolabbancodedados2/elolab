import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme/tokens';

type Verification = {
  found: boolean;
  valid: boolean;
  documentType: string;
  documentReference: string;
  signerName: string;
  signerCRM: string | null;
  signedAt: string;
  method: string;
  hash: string;
};

export default function VerifySignatureScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const [result, setResult] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    setResult(null);
    setError('');
    if (!supabase || !code) {
      setLoading(false);
      setError(!supabase ? 'O serviço de verificação não está configurado.' : 'Código de verificação ausente.');
      return () => { requestSequence.current += 1; };
    }

    setLoading(true);
    void (async () => {
      try {
        // This public RPC returns signature metadata only; it does not expose patient data.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: queryError } = await (supabase as any).rpc('verificar_assinatura_prontuario', { p_codigo: code });
        if (queryError) throw queryError;
        if (requestId !== requestSequence.current) return;
        if (!data?.found) throw new Error('Este código não corresponde a uma assinatura registrada.');
        setResult(data as Verification);
      } catch (reason) {
        if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : 'Não foi possível verificar esta assinatura.');
      } finally {
        if (requestId === requestSequence.current) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [code]);

  return <MobileScreen>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.primary} /><Text style={styles.backText}>Voltar</Text></Pressable>
    <ScreenHeading title="Verificar assinatura" subtitle="Consulta pública da autenticidade e integridade do documento." />
    {loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Verificando código…</Text></View> : null}
    {!loading && error ? <View style={styles.stateCard}><Ionicons name="alert-circle-outline" size={25} color={colors.danger} /><Text style={styles.resultTitle}>Assinatura não verificada</Text><Text style={styles.message}>{error}</Text></View> : null}
    {!loading && result ? <View style={[styles.resultCard, result.valid ? styles.validCard : styles.invalidCard]}>
      <View style={styles.resultHeader}><View style={[styles.resultIcon, result.valid ? styles.validIcon : styles.invalidIcon]}><Ionicons name={result.valid ? 'shield-checkmark' : 'warning'} size={24} color={result.valid ? colors.success : colors.danger} /></View><View style={styles.resultHeading}><Text style={styles.resultTitle}>{result.valid ? 'Assinatura válida' : 'Integridade não confirmada'}</Text><Text style={styles.message}>{result.valid ? 'O conteúdo continua íntegro desde a assinatura.' : 'O conteúdo do documento diverge do hash registrado.'}</Text></View></View>
      <VerificationField label="Documento" value={`${result.documentType} #${result.documentReference}`} />
      <VerificationField label="Assinante" value={result.signerName} />
      {result.signerCRM ? <VerificationField label="CRM" value={result.signerCRM} /> : null}
      <VerificationField label="Data da assinatura" value={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(result.signedAt))} />
      <VerificationField label="Método" value={result.method === 'eletronica_simples' ? 'Assinatura eletrônica simples' : result.method} />
      <VerificationField label="Hash SHA-256" value={result.hash} selectable />
      <Text style={styles.disclaimer}>A assinatura eletrônica simples não equivale a uma assinatura digital qualificada ICP-Brasil.</Text>
    </View> : null}
  </MobileScreen>;
}

function VerificationField({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><Text selectable={selectable} style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  back: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginBottom: 7 }, backText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  state: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 10 }, stateText: { color: colors.muted, fontSize: 12 }, stateCard: { alignItems: 'center', padding: 22, gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  resultCard: { padding: 15, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface }, validCard: { borderColor: colors.success }, invalidCard: { borderColor: colors.danger }, resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 13 }, resultIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, validIcon: { backgroundColor: colors.successSoft }, invalidIcon: { backgroundColor: colors.warningSoft }, resultHeading: { flex: 1 }, resultTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' }, message: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }, field: { paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, label: { color: colors.muted, fontSize: 10, fontWeight: '700', marginBottom: 4 }, value: { color: colors.ink, fontSize: 11, lineHeight: 16 }, disclaimer: { color: colors.warning, fontSize: 10, lineHeight: 15, marginTop: 9 },
});
