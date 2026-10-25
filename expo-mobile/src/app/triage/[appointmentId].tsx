import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppRole } from '../../auth/AuthContext';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme/tokens';

const allowedRoles: AppRole[] = ['admin', 'medico', 'enfermagem'];
const riskLevels = [
  { key: 'vermelho', label: 'Emergência', wait: 'Imediato', color: '#C33D4D', soft: '#FCEBED' },
  { key: 'laranja', label: 'Muito urgente', wait: '10 min', color: '#C66A19', soft: '#FFF0E4' },
  { key: 'amarelo', label: 'Urgente', wait: '30 min', color: '#A87C00', soft: '#FFF8DC' },
  { key: 'verde', label: 'Pouco urgente', wait: '120 min', color: '#287A55', soft: '#E8F5EE' },
  { key: 'azul', label: 'Não urgente', wait: '240 min', color: '#2C65A2', soft: '#EAF2FB' },
] as const;

type Risk = typeof riskLevels[number]['key'];
type Appointment = { id: string; paciente_id: string; status: string | null; data: string; exige_triagem: boolean | null; hora_inicio: string | null; pacientes: { nome: string | null; nome_social: string | null } | null };
type FormState = {
  pressao: string; fc: string; fr: string; temperatura: string; saturacao: string;
  peso: string; altura: string; glicemia: string; dor: string; queixa: string;
  risco: Risk | ''; observacoes: string;
};

const initialForm: FormState = { pressao: '', fc: '', fr: '', temperatura: '', saturacao: '', peso: '', altura: '', glicemia: '', dor: '', queixa: '', risco: '', observacoes: '' };

function parseClinicalValue(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

function optionalValue(value: string) {
  return value.trim() ? parseClinicalValue(value) : null;
}

function timeLabel(value: string | null) {
  if (!value) return 'Horário não informado';
  return value.includes('T') ? value.slice(11, 16) : value.slice(0, 5);
}

function clinicToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export default function TriageFormScreen() {
  const { appointmentId: rawAppointmentId } = useLocalSearchParams<{ appointmentId: string }>();
  const appointmentId = Array.isArray(rawAppointmentId) ? rawAppointmentId[0] : rawAppointmentId;
  const { session, profile, profileLoading } = useAuth();
  const clinicId = profile?.clinicaId;
  const allowed = Boolean(profile?.roles.some(role => allowedRoles.includes(role)));
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean; warning?: boolean } | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!supabase || !clinicId || !allowed || !appointmentId) {
      setAppointment(null);
      setLoadError(!allowed ? 'Esta conta não tem acesso à triagem clínica.' : 'Não foi possível identificar a clínica ou o agendamento.');
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError('');
    setAppointment(null);
    void (async () => {
      // As relações desta consulta usam o mesmo contrato e escopo do formulário web.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db.from('agendamentos')
        .select('id, paciente_id, status, data, exige_triagem, hora_inicio, pacientes(nome, nome_social)')
        .eq('id', appointmentId)
        .eq('clinica_id', clinicId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Agendamento não encontrado nesta clínica.');
      if (data.data !== clinicToday()) throw new Error('A triagem só está disponível para agendamentos de hoje.');
      if (!['agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'pago'].includes(data.status ?? '')) throw new Error('Este agendamento não está em uma etapa que aceite triagem.');
      if (data.exige_triagem === false) throw new Error('Este agendamento não exige triagem.');
      const { data: checkin, error: queueError } = await db.from('fila_atendimento')
        .select('id')
        .eq('agendamento_id', appointmentId)
        .eq('clinica_id', clinicId)
        .in('status', ['aguardando', 'chamado', 'em_atendimento'])
        .limit(1)
        .maybeSingle();
      if (queueError) throw queueError;
      if (!checkin) throw new Error('O paciente precisa fazer check-in na recepção antes da triagem.');
      const { data: existing, error: existingError } = await db.from('triagens')
        .select('id')
        .eq('agendamento_id', appointmentId)
        .eq('clinica_id', clinicId)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) throw new Error('Este agendamento já tem uma triagem registrada. Atualize a fila antes de continuar.');
      if (active) setAppointment(data as Appointment);
    })().catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar o agendamento.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [appointmentId, allowed, clinicId, profileLoading]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setMessage(null);
  };

  function validate(): string | null {
    if (!form.pressao.trim() || !form.queixa.trim()) return 'Preencha pressão arterial e queixa principal.';
    if (!form.risco) return 'Selecione a classificação de risco.';
    const pressureMatch = form.pressao.match(/^(\d{2,3})\/(\d{2,3})$/);
    if (!pressureMatch) return 'Pressão arterial deve estar no formato SIS/DIA (ex.: 120/80).';
    const systolic = Number(pressureMatch[1]);
    const diastolic = Number(pressureMatch[2]);
    if (systolic < 50 || systolic > 300 || diastolic < 20 || diastolic > 200) return 'Pressão arterial fora da faixa aceitável (SIS: 50–300, DIA: 20–200).';
    if (diastolic >= systolic) return 'A pressão diastólica deve ser menor que a sistólica.';
    const checks: [string, number | null, number, number, boolean][] = [
      ['Frequência cardíaca', optionalValue(form.fc), 20, 300, true],
      ['Frequência respiratória', optionalValue(form.fr), 4, 60, true],
      ['Temperatura', optionalValue(form.temperatura), 30, 45, false],
      ['Saturação', optionalValue(form.saturacao), 50, 100, false],
      ['Peso', optionalValue(form.peso), 0.5, 500, false],
      ['Altura', optionalValue(form.altura), 20, 250, false],
      ['Glicemia', optionalValue(form.glicemia), 10, 900, false],
      ['Escala de dor', optionalValue(form.dor), 0, 10, true],
    ];
    for (const [label, value, min, max, integer] of checks) {
      if (value !== null && (Number.isNaN(value) || value < min || value > max || (integer && !Number.isInteger(value)))) {
        return `${label} fora da faixa (${min}–${max}${integer ? ', número inteiro' : ''}).`;
      }
    }
    return null;
  }

  async function save() {
    if (!supabase || !session?.user.id || !clinicId || !appointment || saveLock.current || saved) return;
    const validationError = validate();
    if (validationError) {
      setMessage({ text: validationError, error: true });
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setMessage(null);
    const read = (value: string) => value.trim() ? parseClinicalValue(value) : null;
    const weight = read(form.peso);
    const height = read(form.altura);
    let bmi: number | null = null;
    if (weight && height) {
      const meters = height > 3 ? height / 100 : height;
      const calculated = weight / (meters * meters);
      bmi = Number.isFinite(calculated) ? Number(calculated.toFixed(1)) : null;
    }
    try {
      const { error } = await supabase.from('triagens').insert({
        paciente_id: appointment.paciente_id,
        agendamento_id: appointment.id,
        enfermeiro_id: session.user.id,
        pressao_arterial: form.pressao.trim(),
        frequencia_cardiaca: read(form.fc),
        frequencia_respiratoria: read(form.fr),
        temperatura: read(form.temperatura),
        saturacao: read(form.saturacao),
        peso: weight,
        altura: height,
        imc: bmi,
        glicemia: read(form.glicemia),
        dor_escala: read(form.dor),
        queixa_principal: form.queixa.trim(),
        classificacao_risco: form.risco || null,
        observacoes: form.observacoes.trim() || null,
        data_hora: new Date().toISOString(),
        clinica_id: clinicId,
      });
      if (error) throw error;

      setSaved(true);
      const priority = form.risco === 'vermelho' || form.risco === 'laranja' ? 'urgente' : form.risco === 'amarelo' ? 'preferencial' : 'normal';
      // O registro clínico já está persistido. Se a fila falhar, não habilitamos
      // outro salvamento que possa criar uma triagem duplicada.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: queueResult, error: queueUpdateError } = await db.rpc('realizar_checkin', { p_agendamento_id: appointment.id, p_prioridade: priority });
      setMessage(queueUpdateError || !queueResult
        ? { text: 'Triagem registrada. Não foi possível atualizar a prioridade da fila; confira o painel de atendimento.', warning: true }
        : { text: 'Triagem registrada e fila atualizada com a prioridade indicada.' });
    } catch (error) {
      const duplicate = error && typeof error === 'object' && 'code' in error && error.code === '23505';
      setMessage({ text: duplicate ? 'Este agendamento já tem uma triagem registrada. Atualize a fila antes de continuar.' : 'Não foi possível registrar a triagem. Confira os dados e sua conexão.', error: true });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const patientName = appointment?.pacientes?.nome_social || appointment?.pacientes?.nome || 'Paciente';

  return <>
    <MobileScreen>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.primary} /><Text style={styles.backText}>Voltar ao atendimento</Text></Pressable>
      <ScreenHeading title="Triagem" subtitle="Registre sinais vitais e classifique o risco clínico." />

      {profileLoading || loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Carregando agendamento…</Text></View> : null}
      {!loading && loadError ? <View style={styles.messageError}><Text style={styles.messageText}>{loadError}</Text></View> : null}
      {!loading && appointment ? <>
        <View style={styles.patientCard}><View style={styles.patientIcon}><Ionicons name="person-outline" size={20} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.patientName}>{patientName}</Text><Text style={styles.patientMeta}>{timeLabel(appointment.hora_inicio)} · {appointment.status?.replaceAll('_', ' ') || 'Agendado'}</Text></View></View>
        <View style={styles.section}><Text style={styles.sectionTitle}>Sinais vitais</Text><View style={styles.grid}>
          <Field disabled={saved} label="Pressão arterial *" value={form.pressao} onChangeText={value => update('pressao', value)} placeholder="120/80" unit="mmHg" keyboardType="numbers-and-punctuation" />
          <Field disabled={saved} label="Frequência cardíaca" value={form.fc} onChangeText={value => update('fc', value)} placeholder="80" unit="bpm" keyboardType="number-pad" />
          <Field disabled={saved} label="Frequência respiratória" value={form.fr} onChangeText={value => update('fr', value)} placeholder="16" unit="irpm" keyboardType="number-pad" />
          <Field disabled={saved} label="Temperatura" value={form.temperatura} onChangeText={value => update('temperatura', value)} placeholder="36,5" unit="°C" keyboardType="decimal-pad" />
          <Field disabled={saved} label="Saturação O₂" value={form.saturacao} onChangeText={value => update('saturacao', value)} placeholder="98" unit="%" keyboardType="number-pad" />
          <Field disabled={saved} label="Glicemia" value={form.glicemia} onChangeText={value => update('glicemia', value)} placeholder="100" unit="mg/dL" keyboardType="decimal-pad" />
        </View></View>

        <View style={styles.section}><Text style={styles.sectionTitle}>Antropometria</Text><View style={styles.grid}>
          <Field disabled={saved} label="Peso" value={form.peso} onChangeText={value => update('peso', value)} placeholder="70" unit="kg" keyboardType="decimal-pad" />
          <Field disabled={saved} label="Altura" value={form.altura} onChangeText={value => update('altura', value)} placeholder="170" unit="cm" keyboardType="decimal-pad" />
          <Field disabled={saved} label="Dor (0–10)" value={form.dor} onChangeText={value => update('dor', value)} placeholder="0" keyboardType="number-pad" />
        </View></View>

        <View style={styles.section}><Text style={styles.sectionTitle}>Classificação de risco (Manchester) *</Text><View style={styles.riskList}>
          {riskLevels.map(risk => <Pressable key={risk.key} accessibilityRole="radio" accessibilityState={{ selected: form.risco === risk.key }} disabled={saved} onPress={() => update('risco', risk.key)} style={[styles.risk, { backgroundColor: form.risco === risk.key ? risk.soft : colors.surface, borderColor: form.risco === risk.key ? risk.color : colors.border }]}><View style={[styles.riskDot, { backgroundColor: risk.color }]} /><View style={{ flex: 1 }}><Text style={[styles.riskLabel, { color: risk.color }]}>{risk.label}</Text><Text style={styles.riskWait}>{risk.wait}</Text></View>{form.risco === risk.key ? <Ionicons name="checkmark-circle" size={20} color={risk.color} /> : null}</Pressable>)}
        </View></View>

        <View style={styles.section}><Field disabled={saved} label="Queixa principal *" value={form.queixa} onChangeText={value => update('queixa', value)} placeholder="Descreva a queixa principal" multiline /><Field disabled={saved} label="Observações" value={form.observacoes} onChangeText={value => update('observacoes', value)} placeholder="Informações adicionais" multiline /></View>

        {message ? <View style={[styles.message, message.error && styles.messageError, message.warning && styles.messageWarning]}><Text style={styles.messageText}>{message.text}</Text></View> : null}
        {saved ? <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Voltar para a fila</Text></Pressable> : <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" /><Text style={styles.saveText}>Registrar triagem</Text></>}</Pressable>}
      </> : null}
    </MobileScreen>
  </>;
}

function Field({ label, value, onChangeText, placeholder, unit, keyboardType = 'default', multiline = false, disabled = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; unit?: string; keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'numbers-and-punctuation'; multiline?: boolean; disabled?: boolean }) {
  return <View style={[styles.field, multiline && styles.fullField]}><Text style={styles.label}>{label}</Text><View style={[styles.inputWrap, multiline && styles.multilineWrap, disabled && styles.disabledInput]}><TextInput accessibilityLabel={label} editable={!disabled} keyboardType={keyboardType} multiline={multiline} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.multilineInput]} textAlignVertical={multiline ? 'top' : 'center'} value={value} />{unit ? <Text style={styles.unit}>{unit}</Text> : null}</View></View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, back: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 42, alignSelf: 'flex-start', marginBottom: 6 }, backText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  state: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 10 }, stateText: { color: colors.muted, fontSize: 13 },
  patientCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, patientIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primarySoft }, patientName: { color: colors.ink, fontWeight: '700', fontSize: 14 }, patientMeta: { color: colors.muted, fontSize: 11, marginTop: 4, textTransform: 'capitalize' },
  section: { padding: 14, marginBottom: 13, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 12 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { width: '48%', flexGrow: 1, minWidth: '44%', marginBottom: 3 }, fullField: { width: '100%', minWidth: '100%', marginBottom: 9 }, label: { color: colors.muted, fontSize: 11, fontWeight: '600', marginBottom: 6 }, inputWrap: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: colors.surface }, disabledInput: { backgroundColor: colors.surfaceMuted, opacity: 0.75 }, input: { flex: 1, minHeight: 42, color: colors.ink, fontSize: 13 }, unit: { color: colors.muted, fontSize: 10 }, multilineWrap: { minHeight: 82, alignItems: 'flex-start', paddingVertical: 8 }, multilineInput: { minHeight: 62 },
  riskList: { gap: 8 }, risk: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1.5, borderRadius: 12 }, riskDot: { width: 11, height: 11, borderRadius: 6 }, riskLabel: { fontSize: 12, fontWeight: '700' }, riskWait: { color: colors.muted, fontSize: 10, marginTop: 2 },
  message: { padding: 12, marginBottom: 11, borderRadius: 11, backgroundColor: colors.successSoft }, messageError: { backgroundColor: '#FCEBED' }, messageWarning: { backgroundColor: colors.warningSoft }, messageText: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  saveButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2, borderRadius: 13, backgroundColor: colors.primary }, saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' }, secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 2, borderRadius: 13, backgroundColor: colors.primarySoft }, secondaryText: { color: colors.primary, fontSize: 13, fontWeight: '700' }, pressed: { opacity: 0.82 }, disabled: { opacity: 0.55 },
});
