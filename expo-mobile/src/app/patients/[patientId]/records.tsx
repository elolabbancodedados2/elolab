import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../../auth/useAuth';
import { MobileScreen } from '../../../components/MobileScreen';
import { ScreenHeading } from '../../../components/ScreenHeading';
import { supabase } from '../../../lib/supabase';
import { colors, radius } from '../../../theme/tokens';

type ClinicalRecord = {
  id: string;
  data: string;
  assinado: boolean | null;
  assinado_em: string | null;
  assinado_por: string | null;
  crm_assinante: string | null;
  tipo_assinatura: string | null;
  queixa_principal: string | null;
  hipotese_diagnostica: string | null;
  diagnostico_principal: string | null;
  conduta: string | null;
  sinais_vitais: Record<string, unknown> | null;
  plano_terapeutico: string | null;
  historia_doenca_atual: string | null;
  historia_patologica_pregressa: string | null;
  historia_familiar: string | null;
  historia_social: string | null;
  revisao_sistemas: string | null;
  alergias_relatadas: string | null;
  medicamentos_em_uso: string | null;
  exames_fisicos: string | null;
  exame_cabeca_pescoco: string | null;
  exame_torax: string | null;
  exame_abdomen: string | null;
  exame_membros: string | null;
  exame_neurologico: string | null;
  exame_pele: string | null;
  orientacoes_paciente: string | null;
  observacoes_internas: string | null;
  diagnosticos_secundarios: string[] | null;
  medico_id: string | null;
  medicos: { nome: string | null; crm: string | null; especialidade: string | null } | null;
};

type Prescription = {
  id: string;
  medicamento: string;
  dosagem: string | null;
  posologia: string | null;
  duracao: string | null;
  quantidade: string | null;
  observacoes: string | null;
  tipo: string | null;
};

type Addendum = { id: string; tipo: 'retificacao' | 'complemento' | 'erratum'; motivo: string; texto: string; medico_nome: string; crm: string; created_at: string; hash: string | null };
type CurrentDoctor = { id: string; nome: string; crm: string | null; ativo: boolean | null };

const pageSize = 50;
const vitalLabels: Record<string, string> = {
  pressao_sistolica: 'Pressão sistólica', pressao_diastolica: 'Pressão diastólica',
  frequencia_cardiaca: 'Frequência cardíaca', frequencia_respiratoria: 'Frequência respiratória',
  temperatura: 'Temperatura', saturacao: 'Saturação de oxigênio', peso: 'Peso',
  altura: 'Altura', glasgow: 'Glasgow', dor: 'Dor',
};

function dateLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : 'Data não informada';
}

function vitalValue(key: string, value: unknown) {
  const units: Record<string, string> = {
    pressao_sistolica: 'mmHg', pressao_diastolica: 'mmHg', frequencia_cardiaca: 'bpm',
    frequencia_respiratoria: 'irpm', temperatura: '°C', saturacao: '%', peso: 'kg', altura: 'cm',
  };
  if (value === null || value === undefined || value === '') return '';
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return text ? `${text}${units[key] ? ` ${units[key]}` : ''}` : '';
}

export default function PatientRecordsScreen() {
  const { patientId: rawPatientId } = useLocalSearchParams<{ patientId: string }>();
  const patientId = Array.isArray(rawPatientId) ? rawPatientId[0] : rawPatientId;
  const { session, profile, profileLoading } = useAuth();
  const clinicId = profile?.clinicaId;
  const isDoctor = Boolean(profile?.roles.includes('medico'));
  const scopeKey = `${session?.user.id ?? ''}:${clinicId ?? ''}:${patientId ?? ''}`;
  const canView = Boolean(profile?.roles.some(role => ['admin', 'medico'].includes(role)));
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ClinicalRecord | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [currentDoctor, setCurrentDoctor] = useState<CurrentDoctor | null>(null);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [openingRecordId, setOpeningRecordId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedScope, setLoadedScope] = useState('');
  const requestSequence = useRef(0);
  const hasFocused = useRef(false);

  useEffect(() => {
    let active = true;
    setCurrentDoctor(null);
    if (!isDoctor || !supabase || !clinicId || profileLoading) return () => { active = false; };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any).rpc('buscar_medico_atual').then(({ data, error }: { data: CurrentDoctor[] | null; error: unknown }) => {
      if (active && !error) setCurrentDoctor((data ?? []).find(doctor => doctor.ativo !== false) ?? null);
    });
    return () => { active = false; };
  }, [clinicId, isDoctor, profileLoading, session?.user.id]);

  useFocusEffect(useCallback(() => {
    if (hasFocused.current) setRefreshKey(value => value + 1);
    else hasFocused.current = true;
  }, []));

  const loadPage = useCallback(async (offset = 0) => {
    if (!supabase || !clinicId || !patientId || !canView) return;
    const requestId = ++requestSequence.current;
    const isMore = offset > 0;
    if (isMore) setLoadingMore(true);
    else {
      setLoading(true);
      setLoadingMore(false);
      setError('');
      setRecords([]);
      setLoadedScope('');
      setSelectedRecord(null);
      setPrescriptions([]);
      setVerificationCode(null);
      setOpeningRecordId(null);
      setLoadingPrescriptions(false);
    }
    try {
      // This server audit must succeed before the RLS protected clinical query.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { error: auditError } = await db.rpc('registrar_visualizacao_historico_paciente', { p_paciente_id: patientId });
      if (requestId !== requestSequence.current) return;
      if (auditError) throw new Error('Não foi possível autorizar e registrar a leitura do prontuário. Nenhum dado clínico foi carregado.');
      const { data, error: queryError } = await db.from('prontuarios')
        .select('id, data, assinado, assinado_em, assinado_por, crm_assinante, tipo_assinatura, queixa_principal, hipotese_diagnostica, diagnostico_principal, conduta, sinais_vitais, plano_terapeutico, historia_doenca_atual, historia_patologica_pregressa, historia_familiar, historia_social, revisao_sistemas, alergias_relatadas, medicamentos_em_uso, exames_fisicos, exame_cabeca_pescoco, exame_torax, exame_abdomen, exame_membros, exame_neurologico, exame_pele, orientacoes_paciente, observacoes_internas, diagnosticos_secundarios, medico_id, medicos(nome, crm, especialidade)')
        .eq('paciente_id', patientId)
        .eq('clinica_id', clinicId)
        .order('data', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (queryError) throw queryError;
      if (requestId !== requestSequence.current) return;
      const page = (data ?? []) as ClinicalRecord[];
      setLoadedScope(scopeKey);
      setRecords(current => isMore ? [...current, ...page.filter(item => !current.some(record => record.id === item.id))] : page);
      setHasMore(page.length === pageSize);
    } catch (reason) {
      if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o histórico clínico.');
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [canView, clinicId, patientId, scopeKey]);

  useEffect(() => {
    if (profileLoading) return;
    if (!session || !clinicId || !patientId || !canView || !supabase) {
      requestSequence.current += 1;
      setRecords([]);
      setLoadedScope('');
      setSelectedRecord(null);
      setPrescriptions([]);
      setVerificationCode(null);
      setLoading(false);
      setError(!canView ? 'Somente admin e médico podem consultar o prontuário.' : 'Não foi possível identificar a clínica ou a conexão.');
      return;
    }
    void loadPage();
    return () => { requestSequence.current += 1; };
  }, [canView, clinicId, loadPage, patientId, profileLoading, refreshKey, session]);

  async function openRecord(record: ClinicalRecord) {
    if (!supabase || !clinicId || openingRecordId) return;
    const requestId = ++requestSequence.current;
    setLoadingMore(false);
    setOpeningRecordId(record.id);
    setError('');
    setPrescriptions([]);
    setVerificationCode(null);
    setSelectedRecord(null);
    setLoadingPrescriptions(true);
    try {
      // Log the specific record view before loading its linked prescription details.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { error: auditError } = await db.rpc('registrar_prontuario_acesso', {
        p_prontuario_id: record.id, p_acao: 'visualizacao', p_justificativa: 'Visualização do prontuário no app mobile',
      });
      if (requestId !== requestSequence.current) return;
      if (auditError) throw auditError;
      const { data, error: prescriptionsError } = await db.from('prescricoes')
        .select('id, medicamento, dosagem, posologia, duracao, quantidade, observacoes, tipo')
        .eq('prontuario_id', record.id)
        .eq('clinica_id', clinicId)
        .order('created_at', { ascending: true });
      if (prescriptionsError) throw prescriptionsError;
      if (requestId !== requestSequence.current) return;
      if (record.assinado) {
        const { data: signature } = await db.from('prontuario_assinaturas')
          .select('codigo_verificacao').eq('prontuario_id', record.id).eq('clinica_id', clinicId).maybeSingle();
        if (requestId !== requestSequence.current) return;
        setVerificationCode(signature?.codigo_verificacao ?? null);
      }
      setPrescriptions((data ?? []) as Prescription[]);
      setSelectedRecord(record);
    } catch (reason) {
      if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir este prontuário.');
    } finally {
      if (requestId === requestSequence.current) {
        setOpeningRecordId(null);
        setLoadingPrescriptions(false);
      }
    }
  }

  return <MobileScreen>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.primary} /><Text style={styles.backText}>Voltar ao perfil do paciente</Text></Pressable>
    <ScreenHeading title="Prontuário" subtitle="Histórico clínico com leitura registrada em auditoria." />
    {!profileLoading && canView ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/patients/[patientId]/compose', params: { patientId: patientId ?? '' } })} style={styles.newRecord}><Ionicons name="add-circle-outline" size={18} color="#fff" /><Text style={styles.newRecordText}>Nova evolução clínica</Text></Pressable> : null}
    {!profileLoading && !canView ? <State icon="lock-closed-outline" title="Acesso não disponível" message="Somente admin e médico podem consultar o prontuário." /> : null}
    {profileLoading || loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Autorizando e carregando o histórico…</Text></View> : null}
    {!profileLoading && !loading && error ? <State icon="alert-circle-outline" title="Não foi possível abrir o prontuário" message={error} action={() => setRefreshKey(value => value + 1)} /> : null}
    {!profileLoading && !loading && !error && canView && loadedScope === scopeKey && records.length === 0 ? <State icon="document-text-outline" title="Nenhuma evolução registrada" message="Este paciente ainda não tem registros de prontuário visíveis para esta conta." /> : null}
    {!profileLoading && !loading && !error && canView && loadedScope === scopeKey && records.map(record => <RecordCard key={record.id} record={record} opening={openingRecordId === record.id} selected={selectedRecord?.id === record.id} onPress={() => { if (selectedRecord?.id === record.id) { setSelectedRecord(null); return; } void openRecord(record); }} />)}
    {!profileLoading && loadingPrescriptions && openingRecordId ? <View style={styles.prescriptionsLoading}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.helper}>Registrando acesso e carregando prescrições…</Text></View> : null}
    {!profileLoading && loadedScope === scopeKey && selectedRecord ? <RecordDetail record={selectedRecord} prescriptions={prescriptions} verificationCode={verificationCode} clinicId={clinicId ?? ''} currentDoctor={currentDoctor} canAddendum={Boolean(isDoctor && currentDoctor?.id === selectedRecord.medico_id && currentDoctor.ativo !== false && currentDoctor.crm?.trim())} onEdit={() => router.push({ pathname: '/patients/[patientId]/compose', params: { patientId: patientId ?? '', recordId: selectedRecord.id } })} /> : null}
    {!profileLoading && loadedScope === scopeKey && hasMore && !loading && !error ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void loadPage(records.length)} style={styles.more}>{loadingMore ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="time-outline" size={16} color={colors.primary} />}<Text style={styles.moreText}>{loadingMore ? 'Carregando…' : 'Carregar evoluções anteriores'}</Text></Pressable> : null}
  </MobileScreen>;
}

function RecordCard({ record, opening, selected, onPress }: { record: ClinicalRecord; opening: boolean; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded: selected }} onPress={onPress} style={[styles.recordCard, selected && styles.recordCardSelected]}>
    <View style={styles.recordTop}><View style={styles.recordDate}><Ionicons name="calendar-outline" size={15} color={colors.primary} /><Text style={styles.recordDateText}>{dateLabel(record.data)}</Text></View><Text style={[styles.signature, record.assinado ? styles.signed : styles.draft]}>{record.assinado ? 'Assinado' : 'Rascunho'}</Text></View>
    <Text style={styles.complaint} numberOfLines={2}>{record.queixa_principal || 'Queixa principal não informada'}</Text>
    {record.diagnostico_principal ? <Text style={styles.recordMeta} numberOfLines={1}>Diagnóstico: {record.diagnostico_principal}</Text> : null}
    {record.medicos?.nome ? <Text style={styles.recordMeta} numberOfLines={1}>{record.medicos.nome}{record.medicos.especialidade ? ` · ${record.medicos.especialidade}` : ''}</Text> : null}
    <View style={styles.recordOpen}>{opening ? <ActivityIndicator size="small" color={colors.primary} /> : <><Text style={styles.recordOpenText}>{selected ? 'Ocultar detalhes' : 'Abrir detalhes e prescrições'}</Text><Ionicons name={selected ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} /></>}</View>
  </Pressable>;
}

function RecordDetail({ record, prescriptions, verificationCode, clinicId, currentDoctor, canAddendum, onEdit }: { record: ClinicalRecord; prescriptions: Prescription[]; verificationCode: string | null; clinicId: string; currentDoctor: CurrentDoctor | null; canAddendum: boolean; onEdit: () => void }) {
  const vitals = Object.entries(record.sinais_vitais ?? {})
    .map(([key, value]) => ({ label: vitalLabels[key] || key.replaceAll('_', ' '), value: vitalValue(key, value) }))
    .filter(item => item.value);
  const diagnoses = (record.diagnosticos_secundarios ?? []).filter(Boolean);
  return <View style={styles.detail}>
    <View style={styles.detailHeading}><Ionicons name="document-text-outline" size={18} color={colors.primary} /><Text style={styles.detailTitle}>Evolução de {dateLabel(record.data)}</Text></View>
    {!record.assinado ? <Pressable accessibilityRole="button" onPress={onEdit} style={styles.editDraft}><Ionicons name="create-outline" size={16} color={colors.primary} /><Text style={styles.editDraftText}>Editar rascunho</Text></Pressable> : null}
    {!record.assinado ? <View style={styles.draftNotice}><Ionicons name="information-circle-outline" size={16} color={colors.warning} /><Text style={styles.draftNoticeText}>Rascunho clínico. Confira a autoria e o estado antes de utilizar como documento assinado.</Text></View> : null}
    {record.assinado ? <DataSection title="Assinatura" fields={[
      ['Assinante', record.assinado_por],
      ['Assinado em', record.assinado_em ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(record.assinado_em)) : null],
      ['CRM do assinante', record.crm_assinante], ['Tipo de assinatura', record.tipo_assinatura],
    ]} /> : null}
    {record.assinado ? <DataSection title="Código de verificação" fields={[["Verificação pública", verificationCode || 'Código indisponível']]} /> : null}
    {record.assinado && verificationCode ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/verify-signature/[code]', params: { code: verificationCode } })} style={styles.verifySignature}><Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} /><Text style={styles.verifySignatureText}>Verificar autenticidade</Text><Ionicons name="arrow-forward" size={14} color={colors.primary} /></Pressable> : null}
    <DataSection title="Anamnese" fields={[
      ['Queixa principal', record.queixa_principal], ['História da doença atual', record.historia_doenca_atual],
      ['História patológica pregressa', record.historia_patologica_pregressa], ['História familiar', record.historia_familiar],
      ['História social', record.historia_social], ['Revisão dos sistemas', record.revisao_sistemas],
    ]} />
    {vitals.length ? <View style={styles.dataSection}><Text style={styles.dataTitle}>Sinais vitais</Text><View style={styles.vitals}>{vitals.map(item => <View key={item.label} style={styles.vital}><Text style={styles.vitalLabel}>{item.label}</Text><Text style={styles.vitalValue}>{item.value}</Text></View>)}</View></View> : null}
    <DataSection title="Avaliação" fields={[
      ['Hipótese diagnóstica', record.hipotese_diagnostica], ['Diagnóstico principal', record.diagnostico_principal],
      ['Outros diagnósticos', diagnoses.join(', ')], ['Exame físico', record.exames_fisicos],
      ['Cabeça e pescoço', record.exame_cabeca_pescoco], ['Tórax', record.exame_torax], ['Abdômen', record.exame_abdomen],
      ['Membros', record.exame_membros], ['Neurológico', record.exame_neurologico], ['Pele', record.exame_pele],
    ]} />
    <DataSection title="Plano e conduta" fields={[
      ['Conduta', record.conduta], ['Plano terapêutico', record.plano_terapeutico],
      ['Alergias relatadas', record.alergias_relatadas], ['Medicamentos em uso', record.medicamentos_em_uso],
      ['Orientações ao paciente', record.orientacoes_paciente], ['Observações internas', record.observacoes_internas],
    ]} />
    <View style={styles.dataSection}><Text style={styles.dataTitle}>Prescrições ({prescriptions.length})</Text>{prescriptions.length ? prescriptions.map(item => <View key={item.id} style={styles.prescription}><Text style={styles.prescriptionName}>{item.medicamento}</Text>{item.tipo ? <Text style={styles.recordMeta}>Tipo: {item.tipo}</Text> : null}{item.dosagem ? <Text style={styles.recordMeta}>Dosagem: {item.dosagem}</Text> : null}{item.posologia ? <Text style={styles.recordMeta}>Posologia: {item.posologia}</Text> : null}{item.duracao ? <Text style={styles.recordMeta}>Duração: {item.duracao}</Text> : null}{item.quantidade ? <Text style={styles.recordMeta}>Quantidade: {item.quantidade}</Text> : null}{item.observacoes ? <Text style={styles.recordMeta}>Observações: {item.observacoes}</Text> : null}</View>) : <Text style={styles.helper}>Nenhuma prescrição vinculada a esta evolução.</Text>}</View>
    {record.assinado ? <AddendaSection recordId={record.id} clinicId={clinicId} canCreate={canAddendum} currentDoctor={currentDoctor} /> : null}
  </View>;
}

function AddendaSection({ recordId, clinicId, canCreate, currentDoctor }: { recordId: string; clinicId: string; canCreate: boolean; currentDoctor: CurrentDoctor | null }) {
  const [items, setItems] = useState<Addendum[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState<Addendum['tipo']>('complemento');
  const [motivo, setMotivo] = useState('');
  const [texto, setTexto] = useState('');
  const [saveError, setSaveError] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    if (!supabase || !clinicId || !recordId) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError('');
    try {
      // The parent logs the audited record access before this clinic-scoped read.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('prontuario_adendos')
        .select('id, tipo, motivo, texto, medico_nome, crm, created_at, hash')
        .eq('prontuario_id', recordId).eq('clinica_id', clinicId).order('created_at', { ascending: true });
      if (error) throw error;
      if (requestId === requestSequence.current) setItems((data ?? []) as Addendum[]);
    } catch (reason) {
      if (requestId === requestSequence.current) {
        setItems([]);
        setLoadError(reason instanceof Error ? reason.message : 'Não foi possível carregar os adendos.');
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [clinicId, recordId]);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  async function save() {
    if (!supabase || saving || !canCreate) return;
    if (!motivo.trim() || !texto.trim()) {
      setSaveError('Informe o motivo e o conteúdo do adendo.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      // The RPC checks author, active medical link, CRM and signed state, then stores the hash and audit row atomically.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('registrar_prontuario_adendo', {
        p_prontuario_id: recordId, p_tipo: tipo, p_motivo: motivo, p_texto: texto,
      });
      if (error) throw error;
      setTipo('complemento');
      setMotivo('');
      setTexto('');
      setOpen(false);
      Alert.alert('Adendo registrado', 'O adendo foi gravado como um registro imutável no prontuário.');
      await load();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Não foi possível registrar o adendo.');
    } finally {
      setSaving(false);
    }
  }

  return <View style={styles.addendaSection}>
    <View style={styles.addendaHeader}><View><Text style={styles.dataTitle}>Adendos e retificações ({items.length})</Text><Text style={styles.helper}>Complementos imutáveis vinculados à evolução assinada.</Text></View>{canCreate ? <Pressable accessibilityRole="button" onPress={() => { setSaveError(''); setOpen(true); }} style={styles.addendaAdd}><Ionicons name="add" size={16} color={colors.primary} /><Text style={styles.addendaAddText}>Novo adendo</Text></Pressable> : null}</View>
    <View style={styles.addendaNotice}><Ionicons name="lock-closed-outline" size={14} color={colors.warning} /><Text style={styles.addendaNoticeText}>Correções e complementos ficam registrados separadamente, com autor, motivo, data e hash. O prontuário assinado não é alterado.</Text></View>
    {!canCreate ? <Text style={styles.helper}>{currentDoctor ? 'Somente o médico autor, com CRM ativo, pode registrar adendos.' : 'O registro de adendos exige uma conta médica vinculada com CRM ativo.'}</Text> : null}
    {loading ? <View style={styles.adendaLoading}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.helper}>Carregando adendos…</Text></View> : null}
    {!loading && loadError ? <View style={styles.adendaError}><Text style={styles.inlineError}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View> : null}
    {!loading && !loadError && items.length === 0 ? <Text style={styles.helper}>Nenhum adendo registrado.</Text> : null}
    {!loading && !loadError ? items.map(item => <View key={item.id} style={styles.addendumCard}>
      <View style={styles.addendumTop}><View style={[styles.addendumType, item.tipo === 'retificacao' ? styles.addendumRetification : item.tipo === 'erratum' ? styles.addendumErratum : styles.addendumComplement]}><Text style={styles.addendumTypeText}>{item.tipo === 'retificacao' ? 'Retificação' : item.tipo === 'erratum' ? 'Erratum' : 'Complemento'}</Text></View><Text style={styles.addendumDate}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(item.created_at))}</Text></View>
      <Text style={styles.addendumAuthor}>{item.medico_nome} · CRM {item.crm}</Text><Text style={styles.addendumField}><Text style={styles.addendumLabel}>Motivo: </Text>{item.motivo}</Text><Text style={styles.addendumBody}>{item.texto}</Text>{item.hash ? <Text selectable style={styles.addendumHash}>SHA-256 {item.hash.slice(0, 24)}…</Text> : null}
    </View>) : null}
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => { if (!saving) setOpen(false); }}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Novo adendo</Text><Text style={styles.modalSubtitle}>{currentDoctor?.nome ?? 'Médico autor'}{currentDoctor?.crm ? ` · CRM ${currentDoctor.crm}` : ''}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Fechar adendo" disabled={saving} onPress={() => setOpen(false)} style={styles.modalClose}><Ionicons name="close" size={19} color={colors.muted} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <Text style={styles.label}>Tipo de adendo *</Text><View style={styles.addendaTypes}>{([['complemento', 'Complemento'], ['retificacao', 'Retificação'], ['erratum', 'Erratum']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: tipo === value }} disabled={saving} onPress={() => setTipo(value)} style={[styles.typeOption, tipo === value && styles.typeOptionSelected]}><Text style={[styles.typeOptionText, tipo === value && styles.typeOptionTextSelected]}>{label}</Text></Pressable>)}</View>
            <Text style={styles.label}>Motivo *</Text><TextInput accessibilityLabel="Motivo do adendo" value={motivo} onChangeText={value => { setMotivo(value); setSaveError(''); }} placeholder="Por que este adendo é necessário?" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[styles.adendaInput, styles.adendaMotivo]} />
            <Text style={styles.label}>Conteúdo *</Text><TextInput accessibilityLabel="Conteúdo do adendo" value={texto} onChangeText={value => { setTexto(value); setSaveError(''); }} placeholder="Descreva a correção ou informação complementar." placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[styles.adendaInput, styles.adendaText]} />
            {saveError ? <Text accessibilityRole="alert" style={styles.inlineError}>{saveError}</Text> : null}
            <View style={styles.immutableNotice}><Ionicons name="lock-closed-outline" size={15} color={colors.warning} /><Text style={styles.addendaNoticeText}>Depois de registrado, este adendo não pode ser editado ou apagado.</Text></View>
            <View style={styles.modalActions}><Pressable accessibilityRole="button" disabled={saving} onPress={() => setOpen(false)} style={styles.modalCancel}><Text style={styles.modalCancelText}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.modalSave, saving && styles.disabled]}>{saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="lock-closed-outline" size={15} color="#fff" />}<Text style={styles.modalSaveText}>{saving ? 'Registrando…' : 'Registrar adendo'}</Text></Pressable></View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

function DataSection({ title, fields }: { title: string; fields: [string, string | null | undefined][] }) {
  const present = fields.filter(([, value]) => Boolean(value?.trim()));
  if (!present.length) return null;
  return <View style={styles.dataSection}><Text style={styles.dataTitle}>{title}</Text>{present.map(([label, value]) => <View key={label} style={styles.dataField}><Text style={styles.dataLabel}>{label}</Text><Text selectable style={styles.dataValue}>{value}</Text></View>)}</View>;
}

function State({ icon, title, message, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; message: string; action?: () => void }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name={icon} size={23} color={colors.primary} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{message}</Text>{action ? <Pressable accessibilityRole="button" onPress={action} style={styles.retry}><Text style={styles.retryText}>Tentar novamente</Text></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  back: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginBottom: 7 }, backText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  newRecord: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: -10, marginBottom: 13, borderRadius: 12, backgroundColor: colors.primary }, newRecordText: { color: '#fff', fontSize: 12, fontWeight: '800' }, editDraft: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, backgroundColor: colors.primarySoft }, editDraftText: { color: colors.primary, fontSize: 10, fontWeight: '700' }, verifySignature: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: -5, marginBottom: 12, borderWidth: 1, borderColor: colors.primary, borderRadius: 11, backgroundColor: colors.primarySoft }, verifySignatureText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  state: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 9 }, stateText: { color: colors.muted, fontSize: 12 }, helper: { color: colors.muted, fontSize: 11, lineHeight: 16 }, empty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 42 }, emptyIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderRadius: 17, backgroundColor: colors.primarySoft }, emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' }, emptyText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 }, retry: { minHeight: 40, justifyContent: 'center', marginTop: 10, paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.primarySoft }, retryText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  recordCard: { padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, recordCardSelected: { borderColor: colors.primary }, recordTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, recordDate: { flexDirection: 'row', alignItems: 'center', gap: 6 }, recordDateText: { color: colors.primary, fontSize: 12, fontWeight: '700' }, signature: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, fontSize: 9, fontWeight: '700', textTransform: 'capitalize' }, signed: { color: colors.success, backgroundColor: colors.successSoft }, draft: { color: colors.warning, backgroundColor: colors.warningSoft }, complaint: { color: colors.ink, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 10 }, recordMeta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, recordOpen: { minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, recordOpenText: { color: colors.primary, fontSize: 10, fontWeight: '700' }, prescriptionsLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  detail: { padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, detailHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }, detailTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' }, draftNotice: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', padding: 10, marginBottom: 10, borderRadius: 11, backgroundColor: colors.warningSoft }, draftNoticeText: { flex: 1, color: colors.ink, fontSize: 10, lineHeight: 15 }, dataSection: { paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, dataTitle: { color: colors.ink, fontSize: 11, fontWeight: '800', marginBottom: 8 }, dataField: { marginBottom: 8 }, dataLabel: { color: colors.muted, fontSize: 9, fontWeight: '700', marginBottom: 3 }, dataValue: { color: colors.ink, fontSize: 11, lineHeight: 17 }, vitals: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, vital: { minWidth: '30%', flexGrow: 1, padding: 9, borderRadius: 10, backgroundColor: colors.background }, vitalLabel: { color: colors.muted, fontSize: 9 }, vitalValue: { color: colors.ink, fontSize: 11, fontWeight: '800', marginTop: 3 }, prescription: { paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, prescriptionName: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  addendaSection: { paddingTop: 12, marginTop: 2, borderTopWidth: 1, borderTopColor: colors.border }, addendaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 }, addendaAdd: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, borderRadius: 9, backgroundColor: colors.primarySoft }, addendaAddText: { color: colors.primary, fontSize: 9, fontWeight: '800' }, addendaNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 9, marginVertical: 7, borderRadius: 10, backgroundColor: colors.warningSoft }, addendaNoticeText: { flex: 1, color: colors.ink, fontSize: 9, lineHeight: 14 }, adendaLoading: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10 }, adendaError: { alignItems: 'flex-start', paddingVertical: 6 }, inlineError: { color: colors.danger, fontSize: 10, lineHeight: 15 }, addendumCard: { padding: 11, marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface }, addendumTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, addendumType: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99 }, addendumComplement: { backgroundColor: colors.primarySoft }, addendumRetification: { backgroundColor: colors.warningSoft }, addendumErratum: { backgroundColor: '#FCECEE' }, addendumTypeText: { color: colors.ink, fontSize: 9, fontWeight: '800' }, addendumDate: { color: colors.muted, fontSize: 9 }, addendumAuthor: { color: colors.muted, fontSize: 9, marginTop: 7 }, addendumField: { color: colors.ink, fontSize: 10, lineHeight: 15, marginTop: 7 }, addendumLabel: { color: colors.muted, fontWeight: '800' }, addendumBody: { color: colors.ink, fontSize: 10, lineHeight: 16, marginTop: 5 }, addendumHash: { color: colors.muted, fontSize: 8, marginTop: 8 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 17, 35, 0.45)' }, modalCard: { maxHeight: '90%', paddingHorizontal: 17, paddingTop: 16, paddingBottom: 8, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.background }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, modalTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' }, modalSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3 }, modalClose: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surface }, modalContent: { paddingTop: 13, paddingBottom: 16, gap: 8 }, addendaTypes: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 4 }, typeOption: { minHeight: 38, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface }, typeOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, typeOptionText: { color: colors.muted, fontSize: 9, fontWeight: '700' }, typeOptionTextSelected: { color: colors.primary }, adendaInput: { paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: colors.surface, color: colors.ink, fontSize: 12, lineHeight: 18 }, adendaMotivo: { minHeight: 70 }, adendaText: { minHeight: 125 }, immutableNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 9, marginTop: 2, borderRadius: 10, backgroundColor: colors.warningSoft }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }, modalCancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.surface }, modalCancelText: { color: colors.ink, fontSize: 11, fontWeight: '700' }, modalSave: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.primary }, modalSaveText: { color: '#fff', fontSize: 11, fontWeight: '800' }, disabled: { opacity: 0.55 },
  label: { color: colors.ink, fontSize: 10, fontWeight: '800', marginTop: 4 },
  more: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 14, borderRadius: 12, backgroundColor: colors.primarySoft }, moreText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
});
