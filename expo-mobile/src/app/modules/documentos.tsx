import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Segmented, StateView } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError, parseDateBR } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Mirrors src/pages/DocumentosClinicos.tsx (Prescricoes.tsx, Atestados.tsx). Referrals live in modules/encaminhamentos.
type Tab = 'prescricoes' | 'atestados' | 'anexos';
type Person = { nome: string; nome_social: string | null } | null;
type Rx = { id: string; paciente_id: string; medico_id: string; data_emissao: string | null; medicamento: string | null; posologia: string | null; observacoes: string | null; arquivo_pdf: string | null; pacientes: Person };
type Cert = { id: string; tipo: string | null; paciente_id: string; medico_id: string; data_emissao: string | null; data_inicio: string | null; data_fim: string | null; dias: number | null; motivo: string | null; cid: string | null; observacoes: string | null; modelo_atestado_nome: string | null; pacientes: Person };
type Doctor = { id: string; nome: string | null; crm: string | null };
type Template = { id: string; nome: string; tipo: string | null; conteudo: string | null; cid: string | null; dias_afastamento: number | null };
type Patient = { id: string; nome: string; nome_social: string | null; cpf: string | null };

const certTypes = [{ value: 'comparecimento', label: 'Atestado de Comparecimento' }, { value: 'afastamento', label: 'Atestado Médico (Afastamento)' }, { value: 'aptidao', label: 'Atestado de Aptidão Física' }, { value: 'acompanhante', label: 'Declaração de Acompanhante' }];
const finalidades = ['Apto para prática de atividades físicas moderadas', 'Apto para prática de atividades físicas intensas', 'Apto para concurso público', 'Apto para atividades laborais', 'Apto para viagem'].map(value => ({ value, label: value })).concat({ value: 'custom', label: 'Outra finalidade' });
const typeLabel = (tipo: string | null) => certTypes.find(t => t.value === tipo)?.label ?? tipo ?? 'Atestado';
const name = (p: { nome: string; nome_social?: string | null } | null | undefined) => p?.nome_social || p?.nome || '—';
const isMemed = (rx: Rx) => String(rx.observacoes || '').startsWith('Memed:') || String(rx.observacoes || '').startsWith('Prescrição excluída na Memed. Memed:');
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const hhmm = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const br = (iso: string | null | undefined) => iso ? dateLabel(iso) : '__/__/____';
const newForm = (today: string, medicoId: string) => ({ tipo: 'comparecimento', medico_id: medicoId, paciente: null as Patient | null, data_emissao: today.split('-').reverse().join('/'), data_inicio: today.split('-').reverse().join('/'), dias: '', hora_inicio: '', hora_fim: '', finalidade: '', motivo: '', observacoes: '', cid: '', incluirCid: false, modelo_id: null as string | null });

export default function ClinicalDocumentsScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const roles = profile?.roles ?? [];
  // Same rule as useCurrentMedico on the web: a doctor without admin/front-desk/nursing roles sees and signs only own documents.
  const medicoOnly = roles.includes('medico') && !roles.includes('admin') && !roles.includes('recepcao') && !roles.includes('enfermagem');
  const [tab, setTab] = useState<Tab>('prescricoes');
  const [form, setForm] = useState<ReturnType<typeof newForm> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const current = ((must(await client.rpc('buscar_medico_atual')) ?? []) as { id: string; ativo: boolean | null }[]).find(d => d.ativo !== false) ?? null;
    if (medicoOnly && !current) return { rx: [], certs: [], doctors: [], templates: [], medicoId: null };
    const own = <Q extends { eq: (c: string, v: string) => Q }>(q: Q) => medicoOnly && current ? q.eq('medico_id', current.id) : q;
    const [rx, certs, doctors, templates] = await Promise.all([
      own(client.from('prescricoes').select('id, paciente_id, medico_id, data_emissao, medicamento, posologia, observacoes, arquivo_pdf, pacientes(nome,nome_social)').eq('clinica_id', clinicId)).order('created_at', { ascending: false }).limit(200),
      own(client.from('atestados').select('id, tipo, paciente_id, medico_id, data_emissao, data_inicio, data_fim, dias, motivo, cid, observacoes, modelo_atestado_nome, pacientes(nome,nome_social)').eq('clinica_id', clinicId)).order('created_at', { ascending: false }).limit(200),
      client.from('medicos').select('id, nome, crm').eq('clinica_id', clinicId).eq('ativo', true).order('nome'),
      client.from('templates_atestado').select('id, nome, tipo, conteudo, cid, dias_afastamento').or(`clinica_id.eq.${clinicId},clinica_id.is.null`).order('nome'),
    ]);
    const allDoctors = (must(doctors) ?? []) as Doctor[];
    return { rx: (must(rx) ?? []) as Rx[], certs: (must(certs) ?? []) as Cert[], doctors: medicoOnly ? allDoctors.filter(d => d.id === current?.id) : allDoctors, templates: (must(templates) ?? []) as Template[], medicoId: current?.id ?? null };
  }, [clinicId, medicoOnly]);

  async function open(kind: 'prescricao' | 'atestado', id: string) {
    if (openId === id) return setOpenId(null);
    setBusy(`open:${id}`); setFeedback(null);
    try {
      // Clinical content is shown only after the server confirms the audit row.
      const audit = must(await db.rpc('registrar_acesso_documento_clinico', { p_tipo: kind, p_documento_id: id, p_acao: 'visualizacao' }));
      if (!audit) throw new Error('A auditoria não confirmou o acesso ao documento.');
      setOpenId(id);
    } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível abrir o documento.'), error: true }); } finally { setBusy(null); }
  }

  function startForm() {
    if (!data?.doctors.length) return setFeedback({ message: 'Não há médicos ativos para emitir atestados.', error: true });
    setForm(newForm(today, data.medicoId && data.doctors.some(d => d.id === data.medicoId) ? data.medicoId : data.doctors.length === 1 ? data.doctors[0].id : ''));
    setFeedback(null);
  }

  function applyTemplate(t: Template) {
    if (!form) return;
    const dias = Number.isInteger(t.dias_afastamento) && (t.dias_afastamento ?? 0) > 0 ? String(t.dias_afastamento) : form.dias;
    // A CID saved in the template never replaces the patient's consent for this issue.
    setForm({ ...form, tipo: t.tipo || form.tipo, observacoes: t.conteudo || form.observacoes, dias, cid: t.cid || form.cid, incluirCid: false, modelo_id: t.id });
    setFeedback({ message: `Modelo "${t.nome}" carregado.` });
  }

  async function issue() {
    if (!form || !clinicId || !data) return;
    const fail = (message: string) => setFeedback({ message, error: true });
    const emissao = parseDateBR(form.data_emissao);
    const inicio = parseDateBR(form.data_inicio);
    const dias = Number(form.dias);
    const doctor = data.doctors.find(d => d.id === form.medico_id);
    if (!form.paciente || !form.medico_id) return fail('Preencha paciente e médico.');
    if (medicoOnly && form.medico_id !== data.medicoId) return fail('Seu perfil só pode emitir documentos em seu próprio nome.');
    if (!doctor) return fail('Selecione um médico ativo da clínica antes de emitir o atestado.');
    if (!emissao || emissao > today) return fail('Informe uma data de emissão válida, igual ou anterior a hoje.');
    if (form.tipo === 'afastamento' && (!Number.isInteger(dias) || dias < 1)) return fail('Informe a quantidade de dias de afastamento.');
    if (form.tipo === 'afastamento' && !inicio) return fail('Confira as datas do afastamento.');
    if (form.tipo === 'aptidao' && (!form.finalidade || (form.finalidade === 'custom' && !form.motivo.trim()))) return fail('Informe a finalidade do atestado de aptidão.');
    if (form.tipo === 'comparecimento' && (!hhmm(form.hora_inicio) || !hhmm(form.hora_fim))) return fail('Informe o horário de início e fim para atestado de comparecimento.');
    if (form.tipo === 'comparecimento' && form.hora_fim <= form.hora_inicio) return fail('O horário final deve ser posterior ao horário inicial.');
    const afastamento = form.tipo === 'afastamento';
    const fim = afastamento && inicio ? addDays(inicio, dias - 1) : null;
    let motivo = form.motivo;
    if (form.tipo === 'comparecimento') motivo = `Esteve presente das ${form.hora_inicio} às ${form.hora_fim}. ${motivo}`.trim();
    if (form.tipo === 'aptidao') motivo = `Finalidade: ${form.finalidade === 'custom' ? form.motivo.trim() : form.finalidade}.`;
    // Same variable substitution as processTemplateText on the web.
    const observacoes = form.observacoes
      .replace(/\{\{nome_paciente\}\}/gi, form.paciente.nome || '_______________').replace(/\{\{cpf_paciente\}\}/gi, form.paciente.cpf || '_______________')
      .replace(/\{\{data_emissao\}\}/gi, br(emissao)).replace(/\{\{data_atual\}\}/gi, br(today)).replace(/\{\{dias\}\}/gi, afastamento ? String(dias) : '___')
      .replace(/\{\{data_inicio\}\}/gi, br(afastamento ? inicio : emissao)).replace(/\{\{data_fim\}\}/gi, br(fim))
      .replace(/\{\{hora_inicio\}\}/gi, form.hora_inicio || '__:__').replace(/\{\{hora_fim\}\}/gi, form.hora_fim || '__:__')
      .replace(/\{\{medico_nome\}\}/gi, doctor.nome || doctor.crm || '_______________').replace(/\{\{medico_crm\}\}/gi, doctor.crm || '_______________')
      .replace(/\{\{cid\}\}/gi, form.incluirCid ? form.cid || '___' : '___');
    setBusy('new');
    try {
      must(await db.from('atestados').insert({
        clinica_id: clinicId, tipo: form.tipo, paciente_id: form.paciente.id, medico_id: form.medico_id, data_emissao: emissao,
        data_inicio: afastamento ? inicio : null, data_fim: fim, dias: afastamento ? dias : null, cid: form.incluirCid ? form.cid.trim() || null : null,
        motivo, observacoes: observacoes || null, modelo_atestado_id: form.modelo_id,
      }));
      setForm(null);
      setFeedback({ message: 'Atestado emitido com sucesso. Para imprimir, abra o histórico no navegador.' });
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao emitir atestado.'), error: true }); } finally { setBusy(null); }
  }

  const blocked = Boolean(data && medicoOnly && !data.medicoId);
  const body = () => {
    if (loading) return <StateView loading title="Carregando documentos…" />;
    if (error) return <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} />;
    if (blocked) return <StateView icon="medkit-outline" title="Conta sem vínculo médico" message="Vincule seu usuário a um médico ativo para ver e emitir seus documentos." />;
    if (tab === 'prescricoes') {
      const rows = data?.rx ?? [];
      return <>
        <Card><Text style={styles.copy}>A emissão de receitas gera o PDF e confere alergias, comorbidades e interações antes de salvar. Faça isso no navegador.</Text><OpenOnWeb path="/documentos-clinicos" label="Nova receita no navegador" /></Card>
        {!rows.length ? <StateView icon="document-text-outline" title="Nenhuma prescrição" message="Ainda não há receitas registradas." /> : <Section title={`${rows.length} prescrição(ões)`}>{rows.map(rx => <View key={rx.id}>
          <ListRow title={name(rx.pacientes)} subtitle={rx.medicamento} meta={dateLabel(rx.data_emissao)} onPress={() => void open('prescricao', rx.id)}
            right={busy === `open:${rx.id}` ? <Badge label="Abrindo…" /> : <Badge label={rx.arquivo_pdf ? 'PDF' : isMemed(rx) ? 'Memed' : 'Sem PDF'} tone={rx.arquivo_pdf ? 'success' : isMemed(rx) ? 'info' : 'warning'} />} />
          {openId === rx.id ? <Card style={styles.detail}><Text style={styles.label}>Medicamentos e posologia</Text><Text selectable style={styles.value}>{rx.posologia || rx.medicamento || '—'}</Text>{rx.observacoes ? <><Text style={styles.label}>Observações</Text><Text selectable style={styles.value}>{rx.observacoes}</Text></> : null}<Text style={styles.copy}>Baixar o PDF ou anexar a versão assinada: use o navegador.</Text></Card> : null}
        </View>)}</Section>}
      </>;
    }
    if (tab === 'anexos') return <Card><Text style={styles.copy}>A busca de anexos clínicos abre arquivos (PDF e imagens) e fica disponível no navegador.</Text><OpenOnWeb path="/documentos-clinicos?tab=anexos" /></Card>;
    const rows = data?.certs ?? [];
    return !rows.length ? <StateView icon="document-outline" title="Nenhum atestado" message="Ainda não há atestados emitidos." /> : <Section title={`${rows.length} atestado(s)`}>{rows.map(c => <View key={c.id}>
      <ListRow title={name(c.pacientes)} subtitle={typeLabel(c.tipo)} meta={[dateLabel(c.data_emissao), c.dias ? `${c.dias} dia(s)` : null].filter(Boolean).join(' · ')} onPress={() => void open('atestado', c.id)}
        right={busy === `open:${c.id}` ? <Badge label="Abrindo…" /> : c.tipo === 'afastamento' && c.data_inicio && c.data_fim && c.data_inicio <= today && c.data_fim >= today ? <Badge label="Vigente" tone="primary" /> : null} />
      {openId === c.id ? <Card style={styles.detail}>
        {c.tipo === 'afastamento' ? <Text style={styles.value}>Período: {dateLabel(c.data_inicio)} a {dateLabel(c.data_fim)}</Text> : null}
        {c.cid ? <Text style={styles.value}>CID: {c.cid}</Text> : null}
        {c.motivo ? <><Text style={styles.label}>Motivo</Text><Text selectable style={styles.value}>{c.motivo}</Text></> : null}
        {c.observacoes ? <><Text style={styles.label}>Texto</Text><Text selectable style={styles.value}>{c.observacoes}</Text></> : null}
        {c.modelo_atestado_nome ? <Text style={styles.copy}>Modelo: {c.modelo_atestado_nome}</Text> : null}
        <OpenOnWeb path={`/documentos-clinicos?tab=atestados&paciente=${c.paciente_id}`} label="Imprimir no navegador" />
      </Card> : null}
    </View>)}</Section>;
  };

  return <ModuleScreen moduleKey="documentos" subtitle="Prescrições, atestados e anexos clínicos." refreshing={refreshing} onRefresh={refresh}
    action={tab === 'atestados' && !form && !blocked && !loading ? <Button label="Emitir" icon="add" onPress={startForm} /> : null}>
    <Segmented options={[{ value: 'prescricoes', label: 'Prescrições' }, { value: 'atestados', label: 'Atestados' }, { value: 'anexos', label: 'Anexos' }]} value={tab} onChange={value => { setTab(value); setForm(null); setOpenId(null); }} />
    {form && tab === 'atestados' ? <Card style={styles.form}>
      {data?.templates.length ? <Chips label="Carregar modelo" options={data.templates.map(t => ({ value: t.id, label: t.nome }))} value={form.modelo_id} onChange={id => { const t = data.templates.find(x => x.id === id); if (t) applyTemplate(t); }} /> : null}
      <Chips label="Tipo *" options={certTypes} value={form.tipo} onChange={tipo => setForm({ ...form, tipo })} />
      <PatientPicker value={form.paciente} onChange={paciente => setForm({ ...form, paciente })} />
      {(data?.doctors.length ?? 0) > 1 ? <Chips label="Médico *" options={(data?.doctors ?? []).map(d => ({ value: d.id, label: d.nome || `CRM ${d.crm}` }))} value={form.medico_id || null} onChange={medico_id => setForm({ ...form, medico_id })} /> : <Text style={styles.copy}>Médico: {data?.doctors[0]?.nome || data?.doctors[0]?.crm}</Text>}
      <Field label="Data de emissão *" value={form.data_emissao} onChangeText={data_emissao => setForm({ ...form, data_emissao })} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" />
      {form.tipo === 'afastamento' ? <>
        <Field label="Dias de afastamento *" value={form.dias} onChangeText={dias => setForm({ ...form, dias })} keyboardType="number-pad" />
        <Field label="Início do afastamento *" value={form.data_inicio} onChangeText={data_inicio => setForm({ ...form, data_inicio })} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" hint={(() => { const i = parseDateBR(form.data_inicio); const d = Number(form.dias); return i && Number.isInteger(d) && d > 0 ? `Termina em ${dateLabel(addDays(i, d - 1))}` : undefined; })()} />
      </> : null}
      {form.tipo === 'comparecimento' ? <View style={styles.row}>
        <View style={styles.fill}><Field label="Das *" value={form.hora_inicio} onChangeText={hora_inicio => setForm({ ...form, hora_inicio })} placeholder="HH:MM" keyboardType="numbers-and-punctuation" /></View>
        <View style={styles.fill}><Field label="Às *" value={form.hora_fim} onChangeText={hora_fim => setForm({ ...form, hora_fim })} placeholder="HH:MM" keyboardType="numbers-and-punctuation" /></View>
      </View> : null}
      {form.tipo === 'aptidao' ? <Chips label="Finalidade *" options={finalidades} value={form.finalidade || null} onChange={finalidade => setForm({ ...form, finalidade })} /> : null}
      {form.tipo !== 'aptidao' || form.finalidade === 'custom' ? <Field label={form.tipo === 'aptidao' ? 'Descreva a finalidade *' : 'Motivo'} value={form.motivo} onChangeText={motivo => setForm({ ...form, motivo })} multiline /> : null}
      <Field label="Texto do atestado" value={form.observacoes} onChangeText={observacoes => setForm({ ...form, observacoes })} multiline hint="Variáveis do modelo são preenchidas ao emitir." />
      <Field label="CID" value={form.cid} onChangeText={cid => setForm({ ...form, cid })} autoCapitalize="characters" hint="Opcional" />
      <Chips label="Incluir CID no documento" options={[{ value: 'nao', label: 'Não incluir' }, { value: 'sim', label: 'Incluir (autorizado pelo paciente)' }]} value={form.incluirCid ? 'sim' : 'nao'} onChange={v => setForm({ ...form, incluirCid: v === 'sim' })} />
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setForm(null)} /><Button label="Emitir atestado" icon="checkmark" loading={busy === 'new'} onPress={() => void issue()} /></View>
    </Card> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {body()}
    <Text style={styles.note}>Cada abertura de documento é registrada na auditoria clínica.</Text>
  </ModuleScreen>;
}

/** Same RLS-scoped search RPC used by the Patients tab; cpf feeds the {{cpf_paciente}} variable. */
function PatientPicker({ value, onChange }: { value: Patient | null; onChange: (p: Patient | null) => void }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function search() {
    if (term.trim().length < 2) return setErr('Digite ao menos 2 caracteres.');
    setSearching(true); setErr(null);
    try {
      setResults((must(await db.rpc('buscar_pacientes_paginado', { p_termo: term.trim(), p_limite: 20, p_offset: 0, p_status: 'ativos', p_sexo: null, p_convenio_id: null, p_somente_particular: false, p_nascimento_apos: null, p_nascimento_ate: null }).select('id,nome,nome_social,cpf')) ?? []) as Patient[]);
    } catch (e) { setErr(friendlyError(e, 'Não foi possível buscar pacientes')); } finally { setSearching(false); }
  }
  if (value) return <View style={styles.field}><Text style={styles.fieldLabel}>Paciente *</Text><ListRow title={name(value)} icon="person-outline" right={<Button variant="ghost" label="Trocar" onPress={() => onChange(null)} />} /></View>;
  return <View style={styles.field}>
    <Field label="Paciente *" value={term} onChangeText={setTerm} placeholder="Nome, CPF ou telefone" returnKeyType="search" onSubmitEditing={() => void search()} error={err ?? undefined} autoCorrect={false} />
    <Button variant="secondary" label="Buscar paciente" icon="search-outline" loading={searching} onPress={() => void search()} />
    {results ? results.length ? results.map(p => <ListRow key={p.id} title={name(p)} onPress={() => { onChange(p); setResults(null); setTerm(''); }} />) : <Text style={styles.note}>Nenhum paciente corresponde à busca.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  form: { marginBottom: 6 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, detail: { marginVertical: 8, gap: 6 }, row: { flexDirection: 'row', gap: 10 }, fill: { flex: 1 },
  field: { marginBottom: 14 }, fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 6 }, label: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 4 }, value: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  copy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 }, note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 },
});
