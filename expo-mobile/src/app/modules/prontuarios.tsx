import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Field, ListRow, Section, StateView } from '../../components/ui';
import { clinicDate, dateLabel, timeLabel } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type PatientRef = { nome: string; nome_social: string | null } | null;
type Draft = { id: string; paciente_id: string; data: string; updated_at: string | null; pacientes: PatientRef };
type Visit = { id: string; paciente_id: string | null; hora_inicio: string | null; status: string | null; pacientes: PatientRef };
type Patient = { id: string; nome: string; nome_social: string | null; data_nascimento: string | null };

const nameOf = (p: PatientRef) => p?.nome_social || p?.nome || 'Paciente';
// Clinical content opens in the existing audited screen (registrar_visualizacao_historico_paciente runs there).
const openRecords = (patientId: string) => router.push({ pathname: '/patients/[patientId]/records', params: { patientId } });

export default function ProntuariosScreen() {
  const { session, profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const isDoctor = Boolean(profile?.roles.includes('medico'));
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  // Same as the web: today's own patients and own open drafts, only for an account linked to a doctor.
  const overview = useLoad(async client => {
    if (!clinicId) return undefined;
    if (!isDoctor) return { doctorLinked: false, drafts: [] as Draft[], visits: [] as Visit[] };
    const doctors = must<{ id: string; ativo: boolean | null }[]>(await client.rpc('buscar_medico_atual')) ?? [];
    const medicoId = doctors.find(d => d.ativo !== false)?.id;
    if (!medicoId) return { doctorLinked: false, drafts: [] as Draft[], visits: [] as Visit[] };
    const [drafts, visits] = await Promise.all([
      client.from('prontuarios').select('id, paciente_id, data, updated_at, pacientes(nome, nome_social)').eq('clinica_id', clinicId).eq('medico_id', medicoId).eq('assinado', false)
        .order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(50),
      client.from('agendamentos').select('id, paciente_id, hora_inicio, status, pacientes(nome, nome_social)').eq('clinica_id', clinicId).eq('data', clinicDate()).eq('medico_id', medicoId)
        .order('hora_inicio', { ascending: true }).limit(100),
    ]);
    return { doctorLinked: true, drafts: (must(drafts) ?? []) as Draft[], visits: ((must(visits) ?? []) as Visit[]).filter(v => v.paciente_id && !['cancelado', 'faltou'].includes(v.status ?? '')) };
  }, [clinicId, isDoctor, session?.user.id]);

  const results = useLoad(async client => {
    if (!clinicId || term.length < 2) return [] as Patient[];
    return (must(await client.rpc('buscar_pacientes_paginado', {
      p_termo: term, p_limite: 30, p_offset: 0, p_status: 'ativos',
      p_sexo: null, p_convenio_id: null, p_somente_particular: false, p_nascimento_apos: null, p_nascimento_ate: null,
    }).select('id, nome, nome_social, data_nascimento')) ?? []) as Patient[];
  }, [clinicId, term]);

  const data = overview.data;
  return <ModuleScreen moduleKey="prontuarios" subtitle="Abra o prontuário do paciente. Toda leitura é registrada em auditoria." refreshing={overview.refreshing} onRefresh={() => { overview.refresh(); results.reload(); }}>
    <Field label="Buscar paciente" value={search} onChangeText={setSearch} placeholder="Nome, CPF ou telefone" autoCorrect={false} returnKeyType="search" hint="Digite ao menos 2 caracteres." />
    {search.trim().length >= 2 ? <Section title="Pacientes encontrados">
      {results.loading || term !== search.trim() ? <StateView loading title="Buscando…" /> : results.error ? <StateView icon="alert-circle-outline" title="Não foi possível concluir a busca" message={results.error} onAction={results.reload} /> : !results.data?.length ? <StateView icon="search-outline" title="Nenhum paciente encontrado" message="Tente outro nome ou confira a grafia da busca." /> :
        results.data.map(p => <ListRow key={p.id} icon="person-outline" title={p.nome_social || p.nome} meta={p.data_nascimento ? `Nascimento ${dateLabel(p.data_nascimento)}` : null} accessibilityLabel={`Abrir prontuário de ${p.nome_social || p.nome}`} onPress={() => openRecords(p.id)} />)}
    </Section> : null}
    {overview.loading ? <StateView loading title="Carregando seus atendimentos…" /> : overview.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={overview.error} onAction={overview.reload} /> : data && !data.doctorLinked ? (isDoctor ? <StateView icon="person-circle-outline" title="Usuário médico não vinculado" message="Vincule esta conta ao cadastro do médico para ver seus pacientes do dia e rascunhos." /> : null) : data ? <>
      <Section title="Pacientes de hoje">{data.visits.length ? data.visits.map(v => <ListRow key={v.id} icon="calendar-outline" title={nameOf(v.pacientes)} meta={timeLabel(v.hora_inicio)} accessibilityLabel={`Abrir prontuário de ${nameOf(v.pacientes)}`} onPress={() => openRecords(v.paciente_id as string)} />) : <Text style={styles.empty}>Nenhum paciente agendado para você hoje.</Text>}</Section>
      <Section title={`Rascunhos abertos (${data.drafts.length})`}>{data.drafts.length ? data.drafts.map(d => <ListRow key={d.id} icon="create-outline" tone="warning" title={nameOf(d.pacientes)} meta={`Evolução de ${dateLabel(d.data)}${d.updated_at ? ` · salvo ${dateLabel(d.updated_at)}` : ''}`} right={<Badge label="Rascunho" tone="warning" />} accessibilityLabel={`Continuar rascunho de ${nameOf(d.pacientes)}`} onPress={() => router.push({ pathname: '/patients/[patientId]/compose', params: { patientId: d.paciente_id, recordId: d.id } })} />) : <Text style={styles.empty}>Nenhum rascunho sem assinatura.</Text>}</Section>
    </> : null}
    <Section title="No computador">
      <Text style={styles.note}>Anexos, protocolos, relatório de alta, impressão em PDF e solicitação de exames pelo prontuário ficam no navegador.</Text>
      <OpenOnWeb path="/prontuarios" />
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({ empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 } });
