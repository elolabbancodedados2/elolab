import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme/tokens';

type PatientSummary = { id: string; nome: string; nome_social: string | null };
const allowedRoles = ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'];
const nonFinancialRoles = ['admin', 'recepcao', 'enfermagem', 'medico'];

export default function PatientsScreen() {
  const { session, profile, profileLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const canView = Boolean(profile?.roles.some(role => allowedRoles.includes(role)));
  const financialOnly = Boolean(profile?.roles.includes('financeiro') && !profile.roles.some(role => nonFinancialRoles.includes(role)));
  const canCreate = Boolean(profile?.roles.some(role => ['admin', 'recepcao', 'enfermagem', 'medico'].includes(role)));

  useFocusEffect(useCallback(() => {
    setRefreshKey(value => value + 1);
  }, []));

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!session || !profile?.clinicaId || !canView || !supabase || debouncedSearch.length < 2) {
      setPatients([]);
      setLoading(false);
      setError(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);
    void (async () => {
      // The paginated RPC was added after the generated DB types were created.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error: queryError } = financialOnly
        ? await db.rpc('buscar_pacientes_resumo_financeiro', {
            p_ids: null, p_termo: debouncedSearch, p_limite: 20, p_sexo: null,
            p_convenio_id: null, p_somente_particular: false, p_nascimento_apos: null, p_nascimento_ate: null,
          })
        : await db.rpc('buscar_pacientes_paginado', {
            p_termo: debouncedSearch, p_limite: 21, p_offset: 0, p_status: 'ativos',
            p_sexo: null, p_convenio_id: null, p_somente_particular: false, p_nascimento_apos: null, p_nascimento_ate: null,
          }).select('id,nome,nome_social');
      if (queryError) throw queryError;
      if (active) setPatients((data ?? []).map((patient: PatientSummary) => ({ id: patient.id, nome: patient.nome, nome_social: patient.nome_social })));
    })().catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [session, profile?.clinicaId, canView, financialOnly, debouncedSearch, refreshKey]);

  return <MobileScreen>
    <View style={styles.headingRow}><View style={{ flex: 1 }}><ScreenHeading title="Pacientes" subtitle="Encontre cadastros e acompanhe históricos." /></View>{canCreate ? <Pressable accessibilityRole="button" accessibilityLabel="Cadastrar novo paciente" onPress={() => router.push('/patients/new')} style={styles.addButton}><Ionicons name="person-add-outline" size={17} color="#FFFFFF" /></Pressable> : null}</View>
    <View style={styles.search}><Ionicons name="search-outline" size={19} color={colors.muted} /><TextInput accessibilityLabel="Buscar paciente" value={search} onChangeText={setSearch} placeholder="Digite ao menos 2 caracteres" placeholderTextColor={colors.placeholder} style={styles.input} returnKeyType="search" autoCorrect={false} /></View>
    <View style={styles.filterRow}><View style={styles.filter}><Ionicons name="filter-outline" size={15} color={colors.primary} /><Text style={styles.filterText}>Ativos</Text></View><Text style={styles.secure}>Acesso conforme seu perfil</Text></View>

    {profileLoading || loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Buscando com segurança…</Text></View> : null}
    {!profileLoading && !canView ? <State icon="lock-closed-outline" title="Acesso não disponível" message="A lista de pacientes não está liberada para o perfil desta conta." /> : null}
    {!profileLoading && canView && error ? <State icon="alert-circle-outline" title="Não foi possível concluir a busca" message="Confira sua conexão e tente novamente." action={() => setRefreshKey(value => value + 1)} /> : null}
    {!profileLoading && canView && search.trim().length < 2 ? <State icon="search-outline" title="Busque um paciente" message="Digite pelo menos dois caracteres para localizar um cadastro." /> : null}
    {!profileLoading && canView && !loading && !error && search.trim().length >= 2 && patients.length === 0 ? <State icon="search-outline" title="Nenhum paciente encontrado" message="Tente outro nome ou confira a grafia da busca." /> : null}
    {!profileLoading && patients.map(patient => <Pressable key={patient.id} accessibilityRole="button" accessibilityLabel={`Abrir perfil de ${patient.nome_social || patient.nome}`} accessibilityState={{ disabled: financialOnly }} disabled={financialOnly} onPress={() => router.push({ pathname: '/patients/[patientId]', params: { patientId: patient.id } })} style={({ pressed }) => [styles.patient, pressed && !financialOnly && styles.patientPressed, financialOnly && styles.patientDisabled]}><View style={styles.avatar}><Ionicons name="person-outline" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.patientName}>{patient.nome_social || patient.nome}</Text><Text style={styles.patientCaption}>{financialOnly ? 'Resumo financeiro' : 'Abrir cadastro e consultas'}</Text></View><Ionicons name={financialOnly ? 'lock-closed-outline' : 'chevron-forward'} size={16} color={colors.muted} /></Pressable>)}
  </MobileScreen>;
}

function State({ icon, title, message, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; message: string; action?: () => void }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name={icon} size={24} color={colors.primary} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{message}</Text>{action ? <Pressable onPress={action} style={styles.retry}><Text style={styles.retryText}>Tentar novamente</Text></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'flex-start' }, addButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginTop: 3, borderRadius: 13, backgroundColor: colors.primary }, search: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14 }, input: { flex: 1, minHeight: 48, fontSize: 13, color: colors.ink }, filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 13 }, filter: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: colors.primarySoft, borderRadius: 10 }, filterText: { fontSize: 11, color: colors.primary, fontWeight: '700' }, secure: { fontSize: 10, color: colors.muted },
  state: { alignItems: 'center', padding: 28, gap: 9 }, stateText: { color: colors.muted, fontSize: 12 }, empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 23, paddingVertical: 42 }, emptyIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, emptyText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 }, retry: { paddingVertical: 10, paddingHorizontal: 14, marginTop: 10, borderRadius: 11, backgroundColor: colors.primarySoft }, retryText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  patient: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, patientPressed: { opacity: 0.7 }, patientDisabled: { opacity: 0.75 }, avatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, patientName: { color: colors.ink, fontSize: 13, fontWeight: '700' }, patientCaption: { color: colors.muted, fontSize: 10, marginTop: 4 },
});
