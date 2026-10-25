import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../../auth/useAuth';
import { MobileScreen } from '../../../components/MobileScreen';
import { ScreenHeading } from '../../../components/ScreenHeading';
import { supabase } from '../../../lib/supabase';
import { colors, radius } from '../../../theme/tokens';

type Vitals = Record<string, string>;
type ClinicalForm = {
  data: string;
  medico_id: string;
  queixa_principal: string;
  historia_doenca_atual: string;
  historia_patologica_pregressa: string;
  historia_familiar: string;
  historia_social: string;
  revisao_sistemas: string;
  alergias_relatadas: string;
  medicamentos_em_uso: string;
  sinais_vitais: Vitals;
  exames_fisicos: string;
  exame_cabeca_pescoco: string;
  exame_torax: string;
  exame_abdomen: string;
  exame_membros: string;
  exame_neurologico: string;
  exame_pele: string;
  hipotese_diagnostica: string;
  diagnostico_principal: string;
  diagnosticos_secundarios: string;
  conduta: string;
  plano_terapeutico: string;
  orientacoes_paciente: string;
  observacoes_internas: string;
};
type TextKey = Exclude<keyof ClinicalForm, 'data' | 'medico_id' | 'sinais_vitais'>;
type PrescriptionDraft = { medicamento: string; dosagem: string; posologia: string; duracao: string; quantidade: string; observacoes: string };
type Doctor = { id: string; nome: string; crm: string | null; especialidade: string | null; ativo: boolean | null };
type Patient = { id: string; nome: string; nome_social: string | null; alergias: string[] | null };

const vitalFields = [
  ['pressao_sistolica', 'Pressão sistólica', 'mmHg'], ['pressao_diastolica', 'Pressão diastólica', 'mmHg'],
  ['frequencia_cardiaca', 'Frequência cardíaca', 'bpm'], ['frequencia_respiratoria', 'Frequência respiratória', 'irpm'],
  ['temperatura', 'Temperatura', '°C'], ['saturacao', 'Saturação de oxigênio', '%'],
  ['peso', 'Peso', 'kg'], ['altura', 'Altura', 'cm'], ['imc', 'IMC', ''], ['glicemia', 'Glicemia', 'mg/dL'],
  ['circunferencia_abdominal', 'Circunferência abdominal', 'cm'], ['circunferencia_craniana', 'Circunferência craniana', 'cm'],
  ['glasgow', 'Glasgow', ''], ['dor', 'Dor', ''],
] as const;

const sections: { title: string; fields: { key: TextKey; label: string; hint?: string }[] }[] = [
  { title: 'Anamnese', fields: [
    { key: 'queixa_principal', label: 'Queixa principal *', hint: 'Motivo da consulta' },
    { key: 'historia_doenca_atual', label: 'História da doença atual' },
    { key: 'historia_patologica_pregressa', label: 'História patológica pregressa' },
    { key: 'historia_familiar', label: 'História familiar' }, { key: 'historia_social', label: 'História social' },
    { key: 'revisao_sistemas', label: 'Revisão dos sistemas' },
  ] },
  { title: 'Saúde e alertas', fields: [
    { key: 'alergias_relatadas', label: 'Alergias relatadas' }, { key: 'medicamentos_em_uso', label: 'Medicamentos em uso' },
  ] },
  { title: 'Exame físico', fields: [
    { key: 'exames_fisicos', label: 'Exame físico geral' }, { key: 'exame_cabeca_pescoco', label: 'Cabeça e pescoço' },
    { key: 'exame_torax', label: 'Tórax' }, { key: 'exame_abdomen', label: 'Abdômen' }, { key: 'exame_membros', label: 'Membros' },
    { key: 'exame_neurologico', label: 'Neurológico' }, { key: 'exame_pele', label: 'Pele' },
  ] },
  { title: 'Avaliação e plano', fields: [
    { key: 'hipotese_diagnostica', label: 'Hipótese diagnóstica' }, { key: 'diagnostico_principal', label: 'Diagnóstico principal' },
    { key: 'diagnosticos_secundarios', label: 'Outros diagnósticos', hint: 'Um diagnóstico por linha' },
    { key: 'conduta', label: 'Conduta' }, { key: 'plano_terapeutico', label: 'Plano terapêutico' },
    { key: 'orientacoes_paciente', label: 'Orientações ao paciente' }, { key: 'observacoes_internas', label: 'Observações internas' },
  ] },
];

const blankPrescription = (): PrescriptionDraft => ({ medicamento: '', dosagem: '', posologia: '', duracao: '', quantidade: '', observacoes: '' });
const blankForm = (date: string): ClinicalForm => ({
  data: date, medico_id: '', queixa_principal: '', historia_doenca_atual: '', historia_patologica_pregressa: '',
  historia_familiar: '', historia_social: '', revisao_sistemas: '', alergias_relatadas: '', medicamentos_em_uso: '',
  sinais_vitais: Object.fromEntries(vitalFields.map(([key]) => [key, ''])), exames_fisicos: '', exame_cabeca_pescoco: '',
  exame_torax: '', exame_abdomen: '', exame_membros: '', exame_neurologico: '', exame_pele: '', hipotese_diagnostica: '',
  diagnostico_principal: '', diagnosticos_secundarios: '', conduta: '', plano_terapeutico: '', orientacoes_paciente: '', observacoes_internas: '',
});

function todayInClinic() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
}

function asText(value: unknown) { return typeof value === 'string' ? value : ''; }

export default function ComposePatientRecordScreen() {
  const params = useLocalSearchParams<{ patientId: string; recordId?: string }>();
  const patientId = Array.isArray(params.patientId) ? params.patientId[0] : params.patientId;
  const recordId = Array.isArray(params.recordId) ? params.recordId[0] : params.recordId;
  const { session, profile, profileLoading } = useAuth();
  const clinicId = profile?.clinicaId;
  const routeScopeKey = `${session?.user.id ?? ''}:${clinicId ?? ''}:${patientId ?? ''}:${recordId ?? ''}`;
  const isAdmin = Boolean(profile?.roles.includes('admin'));
  const isDoctor = Boolean(profile?.roles.includes('medico'));
  const canWrite = isAdmin || isDoctor;
  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [form, setForm] = useState<ClinicalForm>(() => blankForm(todayInClinic()));
  const [prescriptions, setPrescriptions] = useState<PrescriptionDraft[]>([]);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [doctorPickerOpen, setDoctorPickerOpen] = useState(false);
  const [formLoaded, setFormLoaded] = useState(false);
  const [loadedScope, setLoadedScope] = useState('');
  const [currentDoctor, setCurrentDoctor] = useState<Doctor | null>(null);
  const [signatureReady, setSignatureReady] = useState(false);
  const [signing, setSigning] = useState(false);
  const formRef = useRef(form);
  const prescriptionsRef = useRef(prescriptions);
  const dirtyRef = useRef(false);
  const versionRef = useRef(0);
  const saveInProgress = useRef(false);
  const signInProgress = useRef(false);
  const requestSequence = useRef(0);
  const saveRef = useRef<(silent: boolean) => Promise<boolean>>(async () => false);

  const setFormValue = useCallback((next: ClinicalForm) => { formRef.current = next; setForm(next); }, []);
  const markDirty = useCallback(() => { versionRef.current += 1; dirtyRef.current = true; setDirty(true); setSignatureReady(false); setFeedback(''); }, []);

  useEffect(() => {
    if (profileLoading) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadingError('');
    setPatient(null);
    setDoctors([]);
    setCurrentDoctor(null);
    setSignatureReady(false);
    setFormLoaded(false);
    setLoadedScope('');
    dirtyRef.current = false;
    setDirty(false);
    if (!supabase || !session || !clinicId || !patientId || !canWrite) {
      setLoading(false);
      setLoadingError(!canWrite ? 'Somente admin e médico podem criar ou editar prontuários.' : 'Não foi possível identificar a clínica ou a conexão.');
      return () => { requestSequence.current += 1; };
    }

    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any;
        const { data: patientData, error: patientError } = await db.from('pacientes')
          .select('id, nome, nome_social, alergias').eq('id', patientId).eq('clinica_id', clinicId).maybeSingle();
        if (patientError) throw patientError;
        if (!patientData) throw new Error('Paciente não encontrado nesta clínica.');
        if (requestId !== requestSequence.current) return;
        setPatient(patientData as Patient);

        const [{ data: currentDoctorData, error: doctorError }, doctorsResult] = await Promise.all([
          isDoctor ? db.rpc('buscar_medico_atual') : Promise.resolve({ data: [], error: null }),
          isAdmin ? db.from('medicos').select('id, nome, crm, especialidade, ativo').eq('clinica_id', clinicId).eq('ativo', true).order('nome') : Promise.resolve({ data: [], error: null }),
        ]);
        if (doctorError) throw doctorError;
        if (doctorsResult.error) throw doctorsResult.error;
        if (requestId !== requestSequence.current) return;
        const currentDoctor = ((currentDoctorData ?? []) as Doctor[]).find(item => item.ativo !== false);
        const clinicDoctors = (doctorsResult.data ?? []) as Doctor[];
        setDoctors(clinicDoctors);
        setCurrentDoctor(currentDoctor ?? null);

        let nextForm = blankForm(todayInClinic());
        nextForm.alergias_relatadas = Array.isArray(patientData.alergias) ? patientData.alergias.join(', ') : asText(patientData.alergias);
        nextForm.medico_id = currentDoctor?.id ?? '';
        let nextPrescriptions: PrescriptionDraft[] = [];
        let nextRecordId: string | null = null;
        let nextUpdatedAt: string | null = null;

        if (recordId) {
          const { error: historyAuditError } = await db.rpc('registrar_visualizacao_historico_paciente', { p_paciente_id: patientId });
          if (historyAuditError) throw new Error('Não foi possível autorizar a consulta clínica. Nenhum registro foi carregado.');
          const { error: editAuditError } = await db.rpc('registrar_prontuario_acesso', {
            p_prontuario_id: recordId, p_acao: 'edicao', p_justificativa: 'Edição de rascunho no app mobile',
          });
          if (editAuditError) throw editAuditError;
          const { data: record, error: recordError } = await db.from('prontuarios')
            .select('id, data, updated_at, assinado, medico_id, queixa_principal, historia_doenca_atual, historia_patologica_pregressa, historia_familiar, historia_social, revisao_sistemas, alergias_relatadas, medicamentos_em_uso, sinais_vitais, exames_fisicos, exame_cabeca_pescoco, exame_torax, exame_abdomen, exame_membros, exame_neurologico, exame_pele, hipotese_diagnostica, diagnostico_principal, diagnosticos_secundarios, conduta, plano_terapeutico, orientacoes_paciente, observacoes_internas')
            .eq('id', recordId).eq('paciente_id', patientId).eq('clinica_id', clinicId).maybeSingle();
          if (recordError) throw recordError;
          if (!record) throw new Error('Este rascunho não está disponível para esta conta.');
          if (record.assinado === true) throw new Error('Prontuários assinados são imutáveis. Use a função de adendo.');
          if (!isAdmin && record.medico_id !== currentDoctor?.id) throw new Error('Você só pode editar seus próprios rascunhos.');
          const { data: prescriptionData, error: prescriptionError } = await db.from('prescricoes')
            .select('medicamento, dosagem, posologia, duracao, quantidade, observacoes')
            .eq('prontuario_id', recordId).eq('clinica_id', clinicId).order('created_at');
          if (prescriptionError) throw prescriptionError;
          nextForm = {
            ...nextForm,
            data: record.data,
            medico_id: record.medico_id ?? '',
            ...Object.fromEntries(Object.keys(nextForm).filter(key => !['data', 'medico_id', 'sinais_vitais'].includes(key)).map(key => [key, asText(record[key])])) as Partial<ClinicalForm>,
            diagnosticos_secundarios: Array.isArray(record.diagnosticos_secundarios) ? record.diagnosticos_secundarios.join('\n') : '',
            sinais_vitais: { ...nextForm.sinais_vitais, ...(record.sinais_vitais ?? {}) },
          };
          nextPrescriptions = (prescriptionData ?? []).map((item: PrescriptionDraft) => ({ ...blankPrescription(), ...item }));
          nextRecordId = record.id;
          nextUpdatedAt = record.updated_at;
        } else if (isAdmin && !nextForm.medico_id && clinicDoctors.length === 1) {
          nextForm.medico_id = clinicDoctors[0].id;
        }

        if (requestId !== requestSequence.current) return;
        setFormValue(nextForm);
        prescriptionsRef.current = nextPrescriptions;
        setPrescriptions(nextPrescriptions);
        setCurrentRecordId(nextRecordId);
        setUpdatedAt(nextUpdatedAt);
        dirtyRef.current = false;
        setDirty(false);
        setFormLoaded(true);
        setLoadedScope(routeScopeKey);
        setSignatureReady(Boolean(recordId && currentDoctor?.id === nextForm.medico_id && currentDoctor.crm?.trim()));
      } catch (reason) {
        if (requestId === requestSequence.current) setLoadingError(reason instanceof Error ? reason.message : 'Não foi possível abrir o formulário clínico.');
      } finally {
        if (requestId === requestSequence.current) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [canWrite, clinicId, isAdmin, isDoctor, patientId, profileLoading, recordId, routeScopeKey, session, setFormValue]);

  const save = useCallback(async (silent: boolean) => {
    if (silent && !dirtyRef.current) return true;
    if (saveInProgress.current) return false;
    if (!supabase || !clinicId || !patientId || !canWrite) return false;
    saveInProgress.current = true;
    setSaving(true);
    setFeedback('');
    const savingVersion = versionRef.current;
    const currentForm = formRef.current;
    const currentPrescriptions = prescriptionsRef.current;
    try {
      if (!currentForm.queixa_principal.trim()) throw new Error('Preencha a queixa principal antes de salvar.');
      if (!currentForm.medico_id) throw new Error(isAdmin ? 'Selecione o médico responsável antes de salvar.' : 'Sua conta não está vinculada a um médico ativo.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const payload = {
        queixa_principal: currentForm.queixa_principal.trim(),
        historia_doenca_atual: currentForm.historia_doenca_atual,
        historia_patologica_pregressa: currentForm.historia_patologica_pregressa,
        historia_familiar: currentForm.historia_familiar,
        historia_social: currentForm.historia_social,
        revisao_sistemas: currentForm.revisao_sistemas,
        alergias_relatadas: currentForm.alergias_relatadas,
        medicamentos_em_uso: currentForm.medicamentos_em_uso,
        sinais_vitais: currentForm.sinais_vitais,
        exames_fisicos: currentForm.exames_fisicos,
        exame_cabeca_pescoco: currentForm.exame_cabeca_pescoco,
        exame_torax: currentForm.exame_torax,
        exame_abdomen: currentForm.exame_abdomen,
        exame_membros: currentForm.exame_membros,
        exame_neurologico: currentForm.exame_neurologico,
        exame_pele: currentForm.exame_pele,
        hipotese_diagnostica: currentForm.hipotese_diagnostica,
        diagnostico_principal: currentForm.diagnostico_principal,
        diagnosticos_secundarios: currentForm.diagnosticos_secundarios.split('\n').map(value => value.trim()).filter(Boolean),
        conduta: currentForm.conduta,
        plano_terapeutico: currentForm.plano_terapeutico,
        orientacoes_paciente: currentForm.orientacoes_paciente,
        observacoes_internas: currentForm.observacoes_internas,
      };
      let savedId = currentRecordId;
      let savedUpdatedAt = updatedAt;
      if (currentRecordId) {
        if (!updatedAt) throw new Error('Não foi possível confirmar a versão deste rascunho. Reabra o registro antes de salvar.');
        const { data, error } = await db.from('prontuarios').update(payload)
          .eq('id', currentRecordId).eq('clinica_id', clinicId).eq('updated_at', updatedAt)
          .select('id, updated_at').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Este rascunho mudou em outra sessão. Suas alterações continuam nesta tela; recarregue antes de tentar novamente.');
        savedUpdatedAt = data.updated_at;
      } else {
        const { data, error } = await db.from('prontuarios').insert({
          ...payload, paciente_id: patientId, clinica_id: clinicId, medico_id: currentForm.medico_id,
          data: currentForm.data, assinado: false,
        }).select('id, updated_at').single();
        if (error) throw error;
        savedId = data.id;
        savedUpdatedAt = data.updated_at;
      }
      setCurrentRecordId(savedId);
      setUpdatedAt(savedUpdatedAt);
      const { error: prescriptionError } = await db.rpc('substituir_prescricoes_do_prontuario', {
        p_prontuario_id: savedId,
        p_prescricoes: currentPrescriptions.filter(item => item.medicamento.trim()).map(item => ({
          ...item, data_emissao: currentForm.data, tipo: 'simples',
        })),
      });
      if (prescriptionError) throw new Error(`A evolução foi salva, mas as prescrições não foram atualizadas: ${prescriptionError.message}`);
      if (versionRef.current === savingVersion) {
        dirtyRef.current = false;
        setDirty(false);
      }
      setFeedback(silent ? 'Rascunho salvo automaticamente.' : 'Rascunho salvo. Ele permanece sem assinatura.');
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Não foi possível salvar o rascunho.';
      if (!silent) Alert.alert('Não foi possível salvar', message);
      setFeedback(message);
      return false;
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }, [canWrite, clinicId, currentRecordId, isAdmin, patientId, updatedAt]);

  saveRef.current = save;
  useEffect(() => {
    if (!formLoaded || !canWrite) return;
    const interval = setInterval(() => { void saveRef.current(true); }, 30_000);
    return () => clearInterval(interval);
  }, [canWrite, formLoaded]);

  const disablePrevention = usePreventRemove(dirty || saving || signing, ({ repeat }) => {
    Alert.alert('Rascunho com alterações', 'O app salva no prontuário a cada 30 segundos. Você pode salvar agora ou sair descartando as últimas alterações.', [
      { text: 'Continuar editando', style: 'cancel' },
      { text: 'Salvar e sair', onPress: () => { void (async () => { if (await saveRef.current(false)) { disablePrevention(); repeat(); } })(); } },
      { text: 'Sair sem salvar', style: 'destructive', onPress: () => { dirtyRef.current = false; setDirty(false); disablePrevention(); repeat(); } },
    ]);
  });

  const signRecord = () => {
    if (!supabase || !currentRecordId || dirty || saving || saveInProgress.current || signInProgress.current || !signatureReady) return;
    Alert.alert(
      'Assinar prontuário?',
      'Esta assinatura eletrônica simples não usa certificado ICP-Brasil. Depois de assinado, o registro e as prescrições ficam bloqueados para edição.',
      [
        { text: 'Revisar novamente', style: 'cancel' },
        { text: 'Assinar e fechar', onPress: () => {
          void (async () => {
            signInProgress.current = true;
            setSigning(true);
            try {
              // The server calculates and stores the content hash atomically with the signature.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data, error } = await (supabase as any).rpc('assinar_prontuario_verificavel', { p_prontuario_id: currentRecordId });
              if (error) throw error;
              const result = data as { signerName?: string; signerCRM?: string; signedAt?: string; verificationCode?: string };
              dirtyRef.current = false;
              setDirty(false);
              setSignatureReady(false);
              setSigning(false);
              disablePrevention();
              const signedAt = result.signedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(result.signedAt)) : '';
              const verification = result.verificationCode ? `\nCódigo de verificação: ${result.verificationCode}` : '';
              Alert.alert('Prontuário assinado', `${result.signerName ?? currentDoctor?.nome ?? 'Médico'}${result.signerCRM ? ` · CRM ${result.signerCRM}` : ''}${signedAt ? `\n${signedAt}` : ''}${verification}\n\nA assinatura foi registrada no servidor e o documento está bloqueado para edição.`, [{ text: 'Fechar', onPress: () => router.back() }]);
            } catch (reason) {
              Alert.alert('Não foi possível assinar', reason instanceof Error ? reason.message : 'A assinatura não foi registrada. Revise o registro e tente novamente.');
            } finally {
              signInProgress.current = false;
              setSigning(false);
            }
          })();
        } },
      ],
    );
  };

  const updateText = (key: TextKey, value: string) => {
    const next = { ...formRef.current, [key]: value };
    setFormValue(next);
    markDirty();
  };
  const updateVital = (key: string, value: string) => {
    const next = { ...formRef.current, sinais_vitais: { ...formRef.current.sinais_vitais, [key]: value } };
    setFormValue(next);
    markDirty();
  };
  const updatePrescription = (index: number, key: keyof PrescriptionDraft, value: string) => {
    const next = prescriptionsRef.current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item);
    prescriptionsRef.current = next;
    setPrescriptions(next);
    markDirty();
  };
  const addPrescription = () => {
    const next = [...prescriptionsRef.current, blankPrescription()];
    prescriptionsRef.current = next;
    setPrescriptions(next);
    markDirty();
  };
  const removePrescription = (index: number) => {
    const next = prescriptionsRef.current.filter((_, itemIndex) => itemIndex !== index);
    prescriptionsRef.current = next;
    setPrescriptions(next);
    markDirty();
  };

  return <MobileScreen>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.primary} /><Text style={styles.backText}>Voltar ao prontuário</Text></Pressable>
    <ScreenHeading title={currentRecordId ? 'Editar rascunho' : 'Nova evolução'} subtitle="Rascunho clínico. Salvar não assina este registro." />
    {profileLoading || loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.helper}>Carregando acesso e dados do paciente…</Text></View> : null}
    {!profileLoading && !loadingError && patient && formLoaded && loadedScope === routeScopeKey ? <>
      <View style={styles.patientCard}><Ionicons name="person-circle-outline" size={22} color={colors.primary} /><View style={styles.patientIdentity}><Text style={styles.patientName}>{patient.nome_social || patient.nome}</Text><Text style={styles.patientCaption}>Registro clínico · {form.data.split('-').reverse().join('/')}</Text></View><View style={styles.draftBadge}><Text style={styles.draftBadgeText}>Rascunho</Text></View></View>
      <View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={17} color={colors.primary} /><Text style={styles.noticeText}>Acesso auditado. O prontuário fica restrito à equipe clínica da mesma unidade.</Text></View>
      {!form.medico_id || doctorPickerOpen ? <View style={styles.section}><Text style={styles.sectionTitle}>Médico responsável *</Text><Text style={styles.sectionHint}>A autoria precisa corresponder ao profissional que conduziu o atendimento.</Text>{doctors.length ? doctors.map(doctor => <Pressable key={doctor.id} accessibilityRole="radio" accessibilityState={{ selected: form.medico_id === doctor.id }} onPress={() => { const next = { ...formRef.current, medico_id: doctor.id }; setFormValue(next); setDoctorPickerOpen(false); markDirty(); }} style={[styles.doctorOption, form.medico_id === doctor.id && styles.doctorOptionSelected]}><Ionicons name={form.medico_id === doctor.id ? 'radio-button-on' : 'radio-button-off'} size={17} color={form.medico_id === doctor.id ? colors.primary : colors.muted} /><View><Text style={styles.doctorName}>{doctor.nome}</Text><Text style={styles.sectionHint}>{[doctor.especialidade, doctor.crm].filter(Boolean).join(' · ') || 'Profissional ativo'}</Text></View></Pressable>) : <Text style={styles.inlineError}>Nenhum médico ativo disponível. Vincule um profissional à clínica antes de salvar.</Text>}</View> : isAdmin && !recordId ? <Pressable accessibilityRole="button" onPress={() => setDoctorPickerOpen(true)} style={styles.changeDoctor}><Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} /><Text style={styles.changeDoctorText}>Alterar médico responsável</Text></Pressable> : null}
      {sections.map(section => <View key={section.title} style={styles.section}><Text style={styles.sectionTitle}>{section.title}</Text>{section.fields.map(field => <FormField key={field.key} label={field.label} hint={field.hint} value={form[field.key]} onChangeText={value => updateText(field.key, value)} required={field.key === 'queixa_principal'} />)}</View>)}
      <View style={styles.section}><Text style={styles.sectionTitle}>Sinais vitais</Text><View style={styles.vitals}>{vitalFields.map(([key, label, unit]) => <View key={key} style={styles.vitalField}><Text style={styles.label}>{label}{unit ? ` (${unit})` : ''}</Text><TextInput accessibilityLabel={label} value={form.sinais_vitais[key] ?? ''} onChangeText={value => updateVital(key, value)} placeholder="—" placeholderTextColor={colors.muted} keyboardType="decimal-pad" returnKeyType="done" style={styles.vitalInput} /></View>)}</View></View>
      <View style={styles.section}><View style={styles.prescriptionHeading}><View><Text style={styles.sectionTitle}>Prescrições</Text><Text style={styles.sectionHint}>Salvar uma prescrição não movimenta estoque.</Text></View><Pressable accessibilityRole="button" onPress={addPrescription} style={styles.addMedicine}><Ionicons name="add" size={17} color={colors.primary} /><Text style={styles.addMedicineText}>Adicionar</Text></Pressable></View>
        {prescriptions.map((item, index) => <View key={index} style={styles.medicineCard}><View style={styles.medicineTitle}><Text style={styles.medicineTitleText}>Medicamento {index + 1}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remover medicamento ${index + 1}`} onPress={() => removePrescription(index)}><Ionicons name="trash-outline" size={17} color={colors.danger} /></Pressable></View>{(['medicamento', 'dosagem', 'posologia', 'duracao', 'quantidade', 'observacoes'] as const).map(key => <FormField key={key} label={{ medicamento: 'Medicamento', dosagem: 'Dosagem', posologia: 'Posologia', duracao: 'Duração', quantidade: 'Quantidade', observacoes: 'Observações' }[key]} value={item[key]} onChangeText={value => updatePrescription(index, key, value)} required={key === 'medicamento'} multiline={key === 'observacoes'} />)}</View>)}
        {!prescriptions.length ? <Text style={styles.sectionHint}>Nenhuma prescrição adicionada.</Text> : null}
      </View>
      {feedback ? <Text accessibilityRole="alert" style={[styles.feedback, feedback.startsWith('Não foi possível') || feedback.startsWith('A evolução foi salva, mas') ? styles.feedbackError : null]}>{feedback}</Text> : null}
      <Pressable accessibilityRole="button" disabled={saving || signing} onPress={() => void save(false)} style={[styles.saveButton, (saving || signing) && styles.disabled]}>{saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}<Text style={styles.saveText}>{saving ? 'Salvando…' : 'Salvar rascunho'}</Text></Pressable>
      <Text style={styles.saveNote}>Salvamento automático a cada 30 segundos enquanto a tela está aberta. A assinatura é uma ação separada.</Text>
      {currentRecordId && isDoctor ? <View style={styles.signatureCard}><View style={styles.signatureHeading}><Ionicons name="key-outline" size={19} color={colors.primary} /><View style={styles.signatureCopy}><Text style={styles.signatureTitle}>Assinatura eletrônica</Text><Text style={styles.signatureDescription}>Hash verificável registrado pelo servidor; não usa certificado ICP-Brasil.</Text></View></View>{!currentDoctor?.crm?.trim() || currentDoctor.id !== form.medico_id ? <Text style={styles.sectionHint}>A assinatura exige médico ativo com CRM e vínculo com esta conta.</Text> : !signatureReady ? <Text style={styles.sectionHint}>Salve alterações e reabra este rascunho para assinar a versão atual.</Text> : null}<Pressable accessibilityRole="button" disabled={!signatureReady || dirty || saving || signing || !currentDoctor?.crm?.trim()} onPress={signRecord} style={[styles.signButton, (!signatureReady || dirty || saving || signing || !currentDoctor?.crm?.trim()) && styles.disabled]}>{signing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="lock-closed-outline" size={16} color="#fff" />}<Text style={styles.saveText}>{signing ? 'Registrando assinatura…' : 'Assinar e fechar prontuário'}</Text></Pressable></View> : null}
    </> : null}
    {!profileLoading && loadingError ? <View style={styles.errorState}><Ionicons name="alert-circle-outline" size={24} color={colors.danger} /><Text style={styles.errorTitle}>Formulário indisponível</Text><Text style={styles.errorText}>{loadingError}</Text><Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.retry}><Text style={styles.retryText}>Voltar</Text></Pressable></View> : null}
  </MobileScreen>;
}

function FormField({ label, value, onChangeText, hint, required = false, multiline = true }: { label: string; value: string; onChangeText: (value: string) => void; hint?: string; required?: boolean; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}<TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={required ? 'Obrigatório para salvar' : 'Não informado'} placeholderTextColor={colors.muted} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} autoCapitalize="sentences" style={[styles.input, multiline && styles.multiline]} /></View>;
}

const styles = StyleSheet.create({
  back: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginBottom: 7 }, backText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  state: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 9 }, helper: { color: colors.muted, fontSize: 12 },
  patientCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, patientIdentity: { flex: 1 }, patientName: { color: colors.ink, fontSize: 13, fontWeight: '800' }, patientCaption: { color: colors.muted, fontSize: 10, marginTop: 3 }, draftBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, backgroundColor: colors.warningSoft }, draftBadgeText: { color: colors.warning, fontSize: 9, fontWeight: '800' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, marginBottom: 12, borderRadius: 12, backgroundColor: colors.primarySoft }, noticeText: { flex: 1, color: colors.ink, fontSize: 10, lineHeight: 15 },
  section: { padding: 14, marginBottom: 11, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', marginBottom: 11 }, sectionHint: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: -5, marginBottom: 8 },
  field: { marginBottom: 11 }, label: { color: colors.ink, fontSize: 11, fontWeight: '700', marginBottom: 5 }, fieldHint: { color: colors.muted, fontSize: 9, marginTop: -2, marginBottom: 5 }, input: { minHeight: 44, paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: colors.background, color: colors.ink, fontSize: 12, lineHeight: 18 }, multiline: { minHeight: 82 },
  vitals: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, vitalField: { width: '47%' }, vitalInput: { minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: colors.background, color: colors.ink, fontSize: 12 },
  doctorOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 11 }, doctorOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, doctorName: { color: colors.ink, fontSize: 11, fontWeight: '700' }, inlineError: { color: colors.danger, fontSize: 11, lineHeight: 16 }, changeDoctor: { minHeight: 37, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 10 }, changeDoctorText: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  prescriptionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }, addMedicine: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, borderRadius: 10, backgroundColor: colors.primarySoft }, addMedicineText: { color: colors.primary, fontSize: 10, fontWeight: '700' }, medicineCard: { padding: 11, marginTop: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background }, medicineTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }, medicineTitleText: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  feedback: { color: colors.success, fontSize: 11, lineHeight: 16, marginBottom: 9 }, feedbackError: { color: colors.danger }, saveButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 3, borderRadius: 13, backgroundColor: colors.primary }, disabled: { opacity: 0.55 }, saveText: { color: '#fff', fontSize: 12, fontWeight: '800' }, saveNote: { color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  signatureCard: { padding: 13, marginTop: 2, marginBottom: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, signatureHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }, signatureCopy: { flex: 1 }, signatureTitle: { color: colors.ink, fontSize: 12, fontWeight: '800' }, signatureDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, signButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 5, borderRadius: 11, backgroundColor: colors.ink },
  errorState: { alignItems: 'center', padding: 25, gap: 8 }, errorTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' }, errorText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' }, retry: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 5, borderRadius: 10, backgroundColor: colors.primarySoft }, retryText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
});
