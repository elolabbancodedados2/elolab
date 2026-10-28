import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme/tokens';

type ReminderChannel = 'ambos' | 'email' | 'whatsapp' | 'nenhum';
type Form = {
  nome: string; nome_social: string; cpf: string; data_nascimento: string; sexo: 'M' | 'F' | 'O' | '';
  telefone: string; email: string; profissao: string; preferencia_canal_lembrete: ReminderChannel;
  horario_contato_inicio: string; horario_contato_fim: string;
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; estado: string;
  convenio_id: string; numero_carteira: string; validade_carteira: string;
  alergias: string; comorbidades: string; gestante: boolean; amamentando: boolean; observacoes: string;
  is_menor: boolean; nome_responsavel: string; cpf_responsavel: string; parentesco_responsavel: string;
};
type Duplicate = { id: string; nome: string; nome_social: string | null; data_nascimento: string | null; telefone_final: string | null; motivos: string[] };
type Convenio = { id: string; nome: string };

const initialForm: Form = {
  nome: '', nome_social: '', cpf: '', data_nascimento: '', sexo: '', telefone: '', email: '', profissao: '',
  preferencia_canal_lembrete: 'ambos', horario_contato_inicio: '08:00', horario_contato_fim: '20:00',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  convenio_id: '', numero_carteira: '', validade_carteira: '', alergias: '', comorbidades: '',
  gestante: false, amamentando: false, observacoes: '', is_menor: false, nome_responsavel: '', cpf_responsavel: '', parentesco_responsavel: '',
};

const channelOptions: { value: ReminderChannel; label: string }[] = [
  { value: 'ambos', label: 'E-mail e WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'nenhum', label: 'Não enviar' },
];

function digits(value: string) { return value.replace(/\D/g, ''); }

function formatCpf(value: string) {
  const valueDigits = digits(value).slice(0, 11);
  if (valueDigits.length <= 3) return valueDigits;
  if (valueDigits.length <= 6) return `${valueDigits.slice(0, 3)}.${valueDigits.slice(3)}`;
  if (valueDigits.length <= 9) return `${valueDigits.slice(0, 3)}.${valueDigits.slice(3, 6)}.${valueDigits.slice(6)}`;
  return `${valueDigits.slice(0, 3)}.${valueDigits.slice(3, 6)}.${valueDigits.slice(6, 9)}-${valueDigits.slice(9)}`;
}

function formatPhone(value: string) {
  const valueDigits = digits(value).slice(0, 11);
  if (!valueDigits) return '';
  if (valueDigits.length <= 2) return `(${valueDigits}`;
  if (valueDigits.length <= 6) return `(${valueDigits.slice(0, 2)}) ${valueDigits.slice(2)}`;
  if (valueDigits.length <= 10) return `(${valueDigits.slice(0, 2)}) ${valueDigits.slice(2, 6)}-${valueDigits.slice(6)}`;
  return `(${valueDigits.slice(0, 2)}) ${valueDigits.slice(2, 7)}-${valueDigits.slice(7)}`;
}

function validCpf(value: string) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const checkDigit = (length: number) => {
    const sum = Array.from({ length }, (_, index) => Number(cpf[index]) * (length + 1 - index)).reduce((total, part) => total + part, 0);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function formatDateInput(value: string) {
  const valueDigits = digits(value).slice(0, 8);
  if (valueDigits.length <= 2) return valueDigits;
  if (valueDigits.length <= 4) return `${valueDigits.slice(0, 2)}/${valueDigits.slice(2)}`;
  return `${valueDigits.slice(0, 2)}/${valueDigits.slice(2, 4)}/${valueDigits.slice(4)}`;
}

function dateToIso(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return '';
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return validDate(iso) ? iso : '';
}

function dateToDisplay(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}

function todayAtClinic() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function under18(birthDate: string) {
  const isoBirthDate = dateToIso(birthDate);
  if (!isoBirthDate) return false;
  const today = todayAtClinic();
  const [year, month, day] = isoBirthDate.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  const age = todayYear - year - (todayMonth < month || (todayMonth === month && todayDay < day) ? 1 : 0);
  return age >= 0 && age < 18;
}

function splitList(value: string) {
  return [...new Set(value.split(/[\n,;]/).map(item => item.trim()).filter(Boolean))];
}

function normalizeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizePhone(value: string) {
  const phone = digits(value);
  return phone.length >= 12 && phone.startsWith('55') ? phone.slice(2) : phone;
}

type DuplicateSearchRow = { id: string; nome: string; nome_social: string | null; data_nascimento: string | null; telefone: string | null };

async function findDuplicatesWithPatientSearch(db: NonNullable<typeof supabase>, name: string, birthDate: string | null, phone: string, excludePatientId?: string) {
  const searches = [
    ...(digits(phone).length >= 10 ? [{ term: phone, date: null }] : []),
    ...(birthDate ? [{ term: name, date: birthDate }] : []),
  ];
  if (!searches.length) return [];
  const results = await Promise.all(searches.map(({ term, date }) => {
    // The generated database types do not include this existing RPC yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (db.rpc as any)('buscar_pacientes_paginado', {
      p_termo: term, p_limite: 101, p_offset: 0, p_status: 'todos', p_sexo: null,
      p_convenio_id: null, p_somente_particular: false,
      p_nascimento_apos: date, p_nascimento_ate: date,
    }).select('id,nome,nome_social,data_nascimento,telefone');
  }));
  if (results.some(result => result.error)) {
    throw new Error('Não foi possível conferir cadastros parecidos. Nada foi salvo; tente novamente.');
  }
  if (results.some(result => result.data?.length === 101)) {
    throw new Error('Há muitos cadastros parecidos para revisar com segurança. Peça à recepção para conferir antes de criar outra ficha.');
  }

  const candidates = new Map<string, DuplicateSearchRow>();
  for (const result of results) {
    for (const row of (result.data ?? []) as DuplicateSearchRow[]) {
      if (row.id !== excludePatientId) candidates.set(row.id, row);
    }
  }
  const normalizedName = normalizeName(name);
  const normalizedPhone = normalizePhone(phone);
  return [...candidates.values()].flatMap(row => {
    const samePhone = normalizedPhone.length >= 10 && normalizePhone(row.telefone ?? '') === normalizedPhone;
    const sameNameAndBirth = Boolean(birthDate && row.data_nascimento?.slice(0, 10) === birthDate && normalizeName(row.nome) === normalizedName);
    if (!samePhone && !sameNameAndBirth) return [];
    const motivos = [samePhone ? 'telefone' : '', sameNameAndBirth ? 'nome_data_nascimento' : ''].filter(Boolean);
    const normalizedCandidatePhone = normalizePhone(row.telefone ?? '');
    return [{
      id: row.id,
      nome: row.nome,
      nome_social: row.nome_social,
      data_nascimento: row.data_nascimento,
      telefone_final: normalizedCandidatePhone.length > 4 ? normalizedCandidatePhone.slice(-4) : null,
      motivos,
    } satisfies Duplicate];
  }).slice(0, 5);
}

const ufOptions = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function NewPatientScreen() {
  const { patientId: rawPatientId } = useLocalSearchParams<{ patientId?: string }>();
  const patientId = Array.isArray(rawPatientId) ? rawPatientId[0] : rawPatientId;
  const { profile, profileLoading } = useAuth();
  const clinicId = profile?.clinicaId;
  const canCreate = Boolean(profile?.roles.some(role => ['admin', 'recepcao', 'enfermagem', 'medico'].includes(role)));
  const canEdit = Boolean(profile?.roles.some(role => ['admin', 'recepcao', 'medico'].includes(role)));
  const canUseForm = patientId ? canEdit : canCreate;
  const [form, setForm] = useState(initialForm);
  const [patientUpdatedAt, setPatientUpdatedAt] = useState<string | null>(null);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [loadingConvenios, setLoadingConvenios] = useState(false);
  const [loadingPatient, setLoadingPatient] = useState(Boolean(patientId));
  const [patientLoadError, setPatientLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveWarning, setSaveWarning] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedPatientId, setSavedPatientId] = useState<string | null>(null);
  const [possibleDuplicates, setPossibleDuplicates] = useState<Duplicate[]>([]);
  const saveLock = useRef(false);
  const requiresGuardian = form.is_menor || under18(form.data_nascimento);

  useEffect(() => {
    if (!clinicId || !canUseForm || !supabase) return;
    let active = true;
    setLoadingConvenios(true);
    void (async () => {
      // The mobile form reads only active plans belonging to the current clinic.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db.from('convenios')
        .select('id, nome')
        .eq('clinica_id', clinicId)
        .eq('ativo', true)
        .order('nome', { ascending: true });
      if (error) throw error;
      if (active) setConvenios((data ?? []) as Convenio[]);
    })().catch(() => {
      if (active) setSaveWarning('Não foi possível carregar os convênios. Você ainda pode cadastrar sem selecioná-los.');
    }).finally(() => {
      if (active) setLoadingConvenios(false);
    });
    return () => { active = false; };
  }, [canUseForm, clinicId]);

  useEffect(() => {
    if (!patientId) {
      setLoadingPatient(false);
      setPatientLoadError('');
      setPatientUpdatedAt(null);
      return;
    }
    if (profileLoading) return;
    if (!clinicId || !canEdit || !supabase) {
      setLoadingPatient(false);
      setPatientLoadError(!canEdit
        ? 'Este perfil não pode editar fichas de pacientes.'
        : !clinicId
          ? 'Não foi possível identificar a clínica desta conta.'
          : 'Conexão indisponível. Confira a configuração do app e tente novamente.');
      return;
    }
    let active = true;
    setLoadingPatient(true);
    setPatientLoadError('');
    void (async () => {
      // Keep the edit query clinic-scoped and load comorbidities before exposing the form.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [patientResult, conditionsResult] = await Promise.all([
        db.from('pacientes')
          .select('id, updated_at, nome, nome_social, cpf, data_nascimento, sexo, telefone, email, profissao, preferencia_canal_lembrete, horario_contato_inicio, horario_contato_fim, cep, logradouro, numero, complemento, bairro, cidade, estado, convenio_id, numero_carteira, validade_carteira, alergias, gestante, amamentando, observacoes, nome_responsavel, cpf_responsavel, parentesco_responsavel')
          .eq('id', patientId).eq('clinica_id', clinicId).maybeSingle(),
        db.from('paciente_comorbidades')
          .select('descricao')
          .eq('paciente_id', patientId).eq('clinica_id', clinicId).eq('ativo', true)
          .order('created_at', { ascending: true }),
      ]);
      if (patientResult.error) throw patientResult.error;
      if (!patientResult.data) throw new Error('Paciente não encontrado nesta clínica.');
      if (conditionsResult.error) throw new Error('Não foi possível carregar as comorbidades. Recarregue a ficha antes de editar.');

      const record = patientResult.data;
      const birthDate = record.data_nascimento ? String(record.data_nascimento).slice(0, 10) : '';
      const expiryDate = record.validade_carteira ? String(record.validade_carteira).slice(0, 10) : '';
      if (active) {
        setPatientUpdatedAt(record.updated_at ?? null);
        setForm({
          ...initialForm,
          nome: record.nome || '',
          nome_social: record.nome_social || '',
          cpf: formatCpf(record.cpf || ''),
          data_nascimento: birthDate ? dateToDisplay(birthDate) : '',
          sexo: record.sexo || '',
          telefone: formatPhone(record.telefone || ''),
          email: record.email || '',
          profissao: record.profissao || '',
          preferencia_canal_lembrete: record.preferencia_canal_lembrete || 'ambos',
          horario_contato_inicio: String(record.horario_contato_inicio || '08:00').slice(0, 5),
          horario_contato_fim: String(record.horario_contato_fim || '20:00').slice(0, 5),
          cep: record.cep || '', logradouro: record.logradouro || '', numero: record.numero || '', complemento: record.complemento || '',
          bairro: record.bairro || '', cidade: record.cidade || '', estado: record.estado || '', convenio_id: record.convenio_id || '',
          numero_carteira: record.numero_carteira || '', validade_carteira: expiryDate ? dateToDisplay(expiryDate) : '',
          alergias: Array.isArray(record.alergias) ? record.alergias.join(', ') : typeof record.alergias === 'string' ? record.alergias : '',
          comorbidades: ((conditionsResult.data ?? []) as { descricao: string }[]).map(item => item.descricao).filter(Boolean).join(', '),
          gestante: Boolean(record.gestante), amamentando: Boolean(record.amamentando), observacoes: record.observacoes || '',
          is_menor: Boolean(record.nome_responsavel) || Boolean(birthDate && under18(dateToDisplay(birthDate))),
          nome_responsavel: record.nome_responsavel || '', cpf_responsavel: formatCpf(record.cpf_responsavel || ''),
          parentesco_responsavel: record.parentesco_responsavel || '',
        });
      }
    })().catch(reason => {
      if (active) setPatientLoadError(reason instanceof Error ? reason.message : 'Não foi possível carregar esta ficha.');
    }).finally(() => { if (active) setLoadingPatient(false); });
    return () => { active = false; };
  }, [canEdit, clinicId, patientId, profileLoading]);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
    setPossibleDuplicates([]);
    setSaveError('');
  }

  function validate() {
    if (!form.nome.trim()) return 'O nome completo é obrigatório.';
    if (form.cpf && !validCpf(form.cpf)) return 'Informe um CPF válido com 11 dígitos.';
    if (form.cpf_responsavel && !validCpf(form.cpf_responsavel)) return 'Informe um CPF válido para o responsável.';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'Informe um e-mail válido.';
    const birthDate = dateToIso(form.data_nascimento);
    const cardExpiry = dateToIso(form.validade_carteira);
    if (form.data_nascimento && (!birthDate || birthDate > todayAtClinic())) return 'Confira a data de nascimento; ela não pode estar no futuro.';
    if (form.validade_carteira && !cardExpiry) return 'Confira a validade da carteirinha.';
    const phone = digits(form.telefone);
    if (phone && (phone.length < 10 || phone.length > 11)) return 'O telefone deve ter 10 ou 11 dígitos.';
    if (form.horario_contato_inicio === form.horario_contato_fim) return 'Os horários permitidos para lembrete precisam ser diferentes.';
    if (form.profissao?.trim().length > 120) return 'A profissão pode ter até 120 caracteres.';
    if (requiresGuardian && !form.nome_responsavel.trim()) return 'Informe o nome do responsável por pacientes menores ou dependentes.';
    return '';
  }

  async function save(forceAfterDuplicateReview = false) {
    if (!supabase || !clinicId || !canUseForm || saveLock.current || savedPatientId) return;
    const validationError = validate();
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    saveLock.current = true;
    setSaving(true);
    setSaveError('');
    setSaveWarning('');
    try {
      // The web app requires a human review when this clinic-scoped RPC finds
      // similar name/date or phone records. It never merges or edits them.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      if (!forceAfterDuplicateReview) {
        const birthDate = dateToIso(form.data_nascimento) || null;
        const { data: matches, error: duplicateError } = await db.rpc('buscar_possiveis_duplicidades_paciente', {
          p_nome: form.nome.trim(),
          p_data_nascimento: birthDate,
          p_telefone: form.telefone,
          p_excluir: patientId || null,
        });
        let duplicateMatches = matches as Duplicate[] | null;
        if (duplicateError?.code === '42501' && profile?.roles.includes('enfermagem') && !profile.roles.some(role => ['admin', 'recepcao', 'medico'].includes(role))) {
          duplicateMatches = await findDuplicatesWithPatientSearch(db, form.nome, birthDate, form.telefone, patientId);
        } else if (duplicateError) {
          throw new Error('Não foi possível conferir cadastros parecidos. Nada foi salvo; tente novamente.');
        }
        if (duplicateMatches?.length) {
          setPossibleDuplicates(duplicateMatches);
          return;
        }
      }

      const payload = {
        nome: form.nome.trim(),
        nome_social: form.nome_social.trim() || null,
        cpf: form.cpf.trim() || null,
        data_nascimento: dateToIso(form.data_nascimento) || null,
        telefone: form.telefone.trim() || null,
        email: form.email.trim().toLocaleLowerCase('pt-BR') || null,
        profissao: form.profissao.trim() || null,
        preferencia_canal_lembrete: form.preferencia_canal_lembrete,
        horario_contato_inicio: form.horario_contato_inicio,
        horario_contato_fim: form.horario_contato_fim,
        fuso_horario_contato: 'America/Sao_Paulo',
        sexo: form.sexo || null,
        cep: form.cep.trim() || null,
        logradouro: form.logradouro.trim() || null,
        numero: form.numero.trim() || null,
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim() || null,
        cidade: form.cidade.trim() || null,
        estado: form.estado || null,
        convenio_id: form.convenio_id || null,
        numero_carteira: form.numero_carteira.trim() || null,
        validade_carteira: dateToIso(form.validade_carteira) || null,
        alergias: splitList(form.alergias),
        gestante: form.gestante,
        amamentando: form.amamentando,
        observacoes: form.observacoes.trim() || null,
        nome_responsavel: form.nome_responsavel.trim() || null,
        cpf_responsavel: form.cpf_responsavel.trim() || null,
        parentesco_responsavel: form.parentesco_responsavel.trim() || null,
        clinica_id: clinicId,
      };

      let data: { id: string; updated_at?: string | null } | null = null;
      let error: { code?: string; message?: string } | null = null;
      if (patientId) {
        if (!patientUpdatedAt) throw new Error('Não foi possível confirmar a versão desta ficha. Feche e abra o cadastro novamente antes de salvar.');
        const result = await db.from('pacientes').update(payload)
          .eq('id', patientId).eq('clinica_id', clinicId).eq('updated_at', patientUpdatedAt)
          .select('id, updated_at').maybeSingle();
        data = result.data;
        error = result.error;
        if (!error && !data) throw new Error('Esta ficha foi alterada ou removida em outra sessão. Seus dados continuam no formulário; recarregue e confira antes de salvar novamente.');
        if (data?.updated_at) setPatientUpdatedAt(data.updated_at);
      } else {
        const result = await db.from('pacientes').insert(payload).select('id').single();
        data = result.data;
        error = result.error;
      }
      if (error) {
        if (error.code === '23505') throw new Error('Este CPF pode já estar cadastrado nesta clínica. Confira a busca antes de criar outra ficha.');
        throw error;
      }
      if (!data) throw new Error('O banco não retornou o cadastro salvo. Atualize a busca antes de tentar novamente.');
      setSavedPatientId(data.id);

      try {
        const conditions = splitList(form.comorbidades);
        const { error: conditionsError } = await db.rpc('sincronizar_comorbidades_paciente', {
          p_paciente_id: data.id,
          p_descricoes: conditions,
        });
        if (conditionsError) throw conditionsError;
      } catch {
        setSaveWarning(`Paciente ${patientId ? 'atualizado' : 'cadastrado'}, mas as comorbidades não foram salvas. O cadastro principal já está salvo; não envie novamente. Abra o perfil e revise essas informações.`);
        return;
      }
      router.replace({ pathname: '/patients/[patientId]', params: { patientId: data.id } });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível cadastrar o paciente. Confira os dados e tente novamente.');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function openSavedPatient() {
    if (savedPatientId) router.replace({ pathname: '/patients/[patientId]', params: { patientId: savedPatientId } });
  }

  return <>
    <MobileScreen>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.primary} /><Text style={styles.backText}>Voltar aos pacientes</Text></Pressable>
      <ScreenHeading title={patientId ? 'Editar paciente' : 'Novo paciente'} subtitle={patientId ? 'Atualize os dados desta ficha.' : 'Preencha o cadastro e confira os dados antes de salvar.'} />

      {profileLoading || loadingConvenios || loadingPatient ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>{patientId ? 'Carregando ficha…' : 'Preparando cadastro…'}</Text></View> : null}
      {patientLoadError ? <Notice tone="error">{patientLoadError}</Notice> : null}
      {!profileLoading && !patientId && !canCreate ? <Notice tone="error">Este perfil não pode cadastrar pacientes.</Notice> : null}
      {!profileLoading && patientId && !canEdit && !patientLoadError ? <Notice tone="error">Este perfil não pode editar fichas de pacientes.</Notice> : null}
      {!profileLoading && canUseForm && !clinicId ? <Notice tone="error">Não foi possível identificar a clínica desta conta.</Notice> : null}
      {!profileLoading && !loadingPatient && !patientLoadError && canUseForm && clinicId ? <>
        <Section title="Identificação e contato" icon="person-outline">
          <Field label="Nome completo *" value={form.nome} onChangeText={value => update('nome', value)} placeholder="Nome completo do paciente" autoCapitalize="words" />
          <Field label="Nome social" value={form.nome_social} onChangeText={value => update('nome_social', value)} placeholder="Nome de preferência" autoCapitalize="words" />
          <Field label="CPF" value={form.cpf} onChangeText={value => update('cpf', formatCpf(value))} placeholder="000.000.000-00" keyboardType="number-pad" />
          <Field label="Nascimento" value={form.data_nascimento} onChangeText={value => update('data_nascimento', formatDateInput(value))} placeholder="DD/MM/AAAA" keyboardType="number-pad" helper="Dia, mês e ano." />
          <View style={styles.optionBlock}><Text style={styles.label}>Sexo</Text><ChoiceGroup value={form.sexo} options={[{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Feminino' }, { value: 'O', label: 'Outro' }]} onChange={value => update('sexo', value as Form['sexo'])} /></View>
          <Field label="Telefone" value={form.telefone} onChangeText={value => update('telefone', formatPhone(value))} placeholder="(11) 99999-9999" keyboardType="phone-pad" />
          <Field label="E-mail" value={form.email} onChangeText={value => update('email', value)} placeholder="email@exemplo.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Profissão" value={form.profissao} onChangeText={value => update('profissao', value.slice(0, 120))} placeholder="Profissão do paciente" autoCapitalize="words" helper="Até 120 caracteres." />
          <View style={styles.optionBlock}><Text style={styles.label}>Lembretes de consulta</Text><ChoiceGroup value={form.preferencia_canal_lembrete} options={channelOptions} onChange={value => update('preferencia_canal_lembrete', value as ReminderChannel)} /></View>
          <View style={styles.twoColumns}><View style={styles.column}><Field label="Início da janela" value={form.horario_contato_inicio} onChangeText={value => update('horario_contato_inicio', value)} placeholder="08:00" helper="Fuso de Brasília" /></View><View style={styles.column}><Field label="Fim da janela" value={form.horario_contato_fim} onChangeText={value => update('horario_contato_fim', value)} placeholder="20:00" helper="Horário final exclusivo" /></View></View>
          <Toggle label="Paciente menor ou dependente" value={requiresGuardian} disabled={under18(form.data_nascimento)} onPress={() => update('is_menor', !form.is_menor)} />
          {requiresGuardian ? <><Field label="Nome do responsável *" value={form.nome_responsavel} onChangeText={value => update('nome_responsavel', value)} placeholder="Nome completo" autoCapitalize="words" /><Field label="CPF do responsável" value={form.cpf_responsavel} onChangeText={value => update('cpf_responsavel', formatCpf(value))} placeholder="000.000.000-00" keyboardType="number-pad" /><Field label="Parentesco" value={form.parentesco_responsavel} onChangeText={value => update('parentesco_responsavel', value)} placeholder="Mãe, pai, tutor legal…" /></> : null}
        </Section>

        <Section title="Endereço" icon="location-outline">
          <Field label="CEP" value={form.cep} onChangeText={value => update('cep', digits(value).slice(0, 8))} placeholder="00000-000" keyboardType="number-pad" />
          <View style={styles.twoColumns}><View style={styles.column}><Field label="Logradouro" value={form.logradouro} onChangeText={value => update('logradouro', value)} placeholder="Rua ou avenida" /></View><View style={styles.shortColumn}><Field label="Número" value={form.numero} onChangeText={value => update('numero', value)} placeholder="Nº" /></View></View>
          <Field label="Complemento" value={form.complemento} onChangeText={value => update('complemento', value)} placeholder="Apto, bloco…" />
          <View style={styles.twoColumns}><View style={styles.column}><Field label="Bairro" value={form.bairro} onChangeText={value => update('bairro', value)} placeholder="Bairro" /></View><View style={styles.column}><Field label="Cidade" value={form.cidade} onChangeText={value => update('cidade', value)} placeholder="Cidade" /></View></View>
          <View style={styles.optionBlock}><Text style={styles.label}>Estado</Text><ChoiceGroup value={form.estado} options={ufOptions.map(uf => ({ value: uf, label: uf }))} onChange={value => update('estado', value)} /></View>
        </Section>

        <Section title="Convênio" icon="card-outline">
          <View style={styles.optionBlock}><Text style={styles.label}>Plano</Text><ChoiceGroup value={form.convenio_id} options={[{ value: '', label: 'Particular' }, ...convenios.map(item => ({ value: item.id, label: item.nome }))]} onChange={value => update('convenio_id', value)} /></View>
          {form.convenio_id ? <><Field label="Número da carteira" value={form.numero_carteira} onChangeText={value => update('numero_carteira', value)} placeholder="Número da carteirinha" /><Field label="Validade" value={form.validade_carteira} onChangeText={value => update('validade_carteira', formatDateInput(value))} placeholder="DD/MM/AAAA" keyboardType="number-pad" /></> : null}
        </Section>

        <Section title="Informações relatadas" icon="warning-outline" warning>
          <Field label="Alergias" value={form.alergias} onChangeText={value => update('alergias', value)} placeholder="Separe por vírgula" helper="Informações declaradas no cadastro; confirme no atendimento." multiline />
          <Field label="Comorbidades" value={form.comorbidades} onChangeText={value => update('comorbidades', value)} placeholder="Separe por vírgula" helper="Será salva no histórico de condições do paciente." multiline />
          <Toggle label="Gestante (informado no cadastro)" value={form.gestante} onPress={() => update('gestante', !form.gestante)} />
          <Toggle label="Amamentando (informado no cadastro)" value={form.amamentando} onPress={() => update('amamentando', !form.amamentando)} />
          <Field label="Observações" value={form.observacoes} onChangeText={value => update('observacoes', value)} placeholder="Informações adicionais" multiline />
        </Section>

        {saveWarning ? <Notice tone="warning">{saveWarning}</Notice> : null}
        {saveError ? <Notice tone="error">{saveError}</Notice> : null}
        {possibleDuplicates.length > 0 ? <View style={styles.duplicatePanel}><View style={styles.duplicateHeading}><Ionicons name="alert-circle-outline" size={18} color={colors.warning} /><Text style={styles.duplicateTitle}>Confira possíveis duplicidades</Text></View><Text style={styles.duplicateCopy}>Encontramos cadastros parecidos nesta clínica. Confira se algum corresponde ao paciente.</Text>{possibleDuplicates.map(match => <View key={match.id} style={styles.duplicateRow}><Text style={styles.duplicateName}>{match.nome_social || match.nome}</Text><Text style={styles.duplicateMeta}>{match.data_nascimento ? `Nascimento: ${match.data_nascimento.split('-').reverse().join('/')}` : 'Nascimento não informado'}{match.telefone_final ? ` · telefone termina em ${match.telefone_final}` : ''}</Text><Text style={styles.duplicateMeta}>{match.motivos.map(reason => reason === 'telefone' ? 'Telefone igual' : 'Mesmo nome e nascimento').join(' · ')}</Text></View>)}<Pressable accessibilityRole="button" disabled={saving} onPress={() => void save(true)} style={styles.duplicateContinue}>{saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.duplicateContinueText}>{patientId ? 'Salvar mesmo assim' : 'Não é a mesma pessoa — criar ficha'}</Text>}</Pressable><Pressable accessibilityRole="button" onPress={() => setPossibleDuplicates([])} style={styles.duplicateCancel}><Text style={styles.duplicateCancelText}>Revisar cadastro</Text></Pressable></View> : null}
        {savedPatientId ? <Pressable accessibilityRole="button" onPress={openSavedPatient} style={styles.openProfile}><Text style={styles.openProfileText}>Abrir perfil do paciente</Text><Ionicons name="arrow-forward" size={17} color="#FFFFFF" /></Pressable> : possibleDuplicates.length === 0 ? <Pressable accessibilityRole="button" disabled={saving || savedPatientId !== null} onPress={() => void save()} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, (saving || savedPatientId !== null) && styles.disabled]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name={patientId ? 'save-outline' : 'person-add-outline'} size={18} color="#FFFFFF" /><Text style={styles.saveText}>{patientId ? 'Salvar alterações' : 'Salvar paciente'}</Text></>}</Pressable> : null}
      </> : null}
    </MobileScreen>
  </>;
}

function Section({ title, icon, children, warning = false }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: ReactNode; warning?: boolean }) {
  return <View style={[styles.section, warning && styles.warningSection]}><View style={styles.sectionHeading}><Ionicons name={icon} size={16} color={warning ? colors.warning : colors.primary} /><Text style={styles.sectionTitle}>{title}</Text></View><View style={styles.sectionContent}>{children}</View></View>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', autoCapitalize = 'sentences', helper, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address' | 'numbers-and-punctuation'; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; helper?: string; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize={autoCapitalize} keyboardType={keyboardType} multiline={multiline} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.multilineInput]} textAlignVertical={multiline ? 'top' : 'center'} value={value} />{helper ? <Text style={styles.helper}>{helper}</Text> : null}</View>;
}

function ChoiceGroup({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <View style={styles.choices}>{options.map(option => <Pressable key={option.value || 'empty'} accessibilityRole="button" accessibilityState={{ selected: value === option.value }} onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.choiceSelected]}><Text style={[styles.choiceText, value === option.value && styles.choiceSelectedText]}>{option.label}</Text></Pressable>)}</View>;
}

function Toggle({ label, value, onPress, disabled = false }: { label: string; value: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={onPress} style={[styles.toggleRow, disabled && styles.disabled]}><Text style={styles.toggleLabel}>{label}</Text><View style={[styles.toggle, value && styles.toggleActive]}><View style={[styles.toggleThumb, value && styles.toggleThumbActive]} /></View></Pressable>;
}

function Notice({ tone, children }: { tone: 'warning' | 'error'; children: string }) {
  const error = tone === 'error';
  return <View style={[styles.notice, error ? styles.noticeError : styles.noticeWarning]}><Ionicons name={error ? 'alert-circle-outline' : 'information-circle-outline'} size={18} color={error ? colors.danger : colors.warning} /><Text style={styles.noticeText}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, back: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginBottom: 7 }, backText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  state: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 8 }, stateText: { color: colors.muted, fontSize: 12 }, section: { padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, warningSection: { borderColor: '#EED7AE', backgroundColor: '#FFFCF4' }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 13 }, sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' }, sectionContent: { gap: 12 },
  field: { gap: 5 }, label: { color: colors.muted, fontSize: 11, fontWeight: '600' }, input: { minHeight: 45, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: colors.surface, color: colors.ink, fontSize: 13 }, multilineInput: { minHeight: 72, paddingTop: 10 }, helper: { color: colors.muted, fontSize: 10, lineHeight: 14 }, optionBlock: { gap: 6 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface }, choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, choiceText: { color: colors.muted, fontSize: 10, fontWeight: '600' }, choiceSelectedText: { color: colors.primary }, twoColumns: { flexDirection: 'row', gap: 9 }, column: { flex: 1 }, shortColumn: { width: 84 },
  toggleRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, toggleLabel: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: '600' }, toggle: { width: 42, height: 24, justifyContent: 'center', padding: 3, borderRadius: 12, backgroundColor: colors.border }, toggleActive: { backgroundColor: colors.primary }, toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' }, toggleThumbActive: { alignSelf: 'flex-end' }, disabled: { opacity: 0.55 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, marginBottom: 10, borderRadius: 11 }, noticeError: { backgroundColor: '#FCEBED' }, noticeWarning: { backgroundColor: colors.warningSoft }, noticeText: { flex: 1, color: colors.ink, fontSize: 11, lineHeight: 17 }, duplicatePanel: { padding: 13, marginBottom: 11, borderWidth: 1, borderColor: '#EED7AE', borderRadius: 14, backgroundColor: '#FFFCF4' }, duplicateHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, duplicateTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' }, duplicateCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 7 }, duplicateRow: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EED7AE' }, duplicateName: { color: colors.ink, fontSize: 12, fontWeight: '700' }, duplicateMeta: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 3 }, duplicateContinue: { minHeight: 43, alignItems: 'center', justifyContent: 'center', marginTop: 11, borderRadius: 11, backgroundColor: colors.primary }, duplicateContinueText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' }, duplicateCancel: { minHeight: 38, alignItems: 'center', justifyContent: 'center' }, duplicateCancelText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  saveButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2, borderRadius: 13, backgroundColor: colors.primary }, saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' }, openProfile: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2, borderRadius: 13, backgroundColor: colors.success }, openProfileText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' }, pressed: { opacity: 0.82 },
});
