import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Mirrors src/pages/Encaminhamentos.tsx + components/clinical/EncaminhamentoMedico.tsx.
type Referral = {
  id: string; paciente_id: string; medico_origem_id: string; medico_destino_id: string | null; especialidade_destino: string; tipo: string | null; urgencia: string | null;
  motivo: string; hipotese_diagnostica: string | null; cid_principal: string | null; exames_realizados: string | null; tratamento_atual: string | null; informacoes_adicionais: string | null;
  status: string | null; data_encaminhamento: string | null; data_atendimento: string | null; contra_referencia: string | null; data_contra_referencia: string | null; updated_at: string | null;
  paciente: { nome: string; nome_social: string | null } | null; medico_origem: { nome: string | null; crm: string } | null;
};
type History = { id: string; status_anterior: string | null; status_novo: string; usuario_nome: string | null; comentario: string | null; data_mudanca: string };
type Patient = { id: string; nome: string; nome_social: string | null };
type Filter = 'todos' | 'pendente' | 'em_andamento' | 'concluido' | 'cancelado';

const statusLabel: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em Andamento', concluido: 'Concluído', cancelado: 'Cancelado' };
const statusTone: Record<string, Tone> = { pendente: 'warning', em_andamento: 'info', concluido: 'success', cancelado: 'neutral' };
const urgencias = [{ value: 'eletivo', label: 'Eletivo' }, { value: 'normal', label: 'Normal' }, { value: 'urgente', label: 'Urgente' }, { value: 'emergencia', label: 'Emergência' }];
const especialidades = ['Cardiologia', 'Dermatologia', 'Endocrinologia', 'Gastroenterologia', 'Ginecologia', 'Neurologia', 'Oftalmologia', 'Ortopedia', 'Otorrinolaringologia', 'Pediatria', 'Pneumologia', 'Psiquiatria', 'Reumatologia', 'Urologia', 'Cirurgia Geral', 'Outras'].map(value => ({ value, label: value }));
const emptyForm = { paciente: null as Patient | null, especialidade: '', urgencia: 'normal', motivo: '', hipotese: '', cid: '', exames: '', tratamento: '', informacoes: '' };
const patientName = (p: { nome: string; nome_social?: string | null } | null | undefined) => p?.nome_social || p?.nome || '—';

export default function ReferralsScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const isAdmin = Boolean(profile?.roles.includes('admin'));
  const [filter, setFilter] = useState<Filter>('todos');
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<History[] | null>(null);
  const [contraRef, setContraRef] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [list, doctor, doctors] = await Promise.all([
      client.from('encaminhamentos').select('id, paciente_id, medico_origem_id, medico_destino_id, especialidade_destino, tipo, urgencia, motivo, hipotese_diagnostica, cid_principal, exames_realizados, tratamento_atual, informacoes_adicionais, status, data_encaminhamento, data_atendimento, contra_referencia, data_contra_referencia, updated_at, paciente:pacientes(nome,nome_social), medico_origem:medicos!encaminhamentos_medico_origem_id_fkey(nome, crm)')
        .eq('clinica_id', clinicId).order('created_at', { ascending: false }).limit(300),
      client.rpc('buscar_medico_atual'),
      client.from('medicos').select('id').eq('clinica_id', clinicId).eq('ativo', true),
    ]);
    const current = ((must(doctor) ?? []) as { id: string; ativo: boolean | null }[]).find(d => d.ativo !== false) ?? null;
    return { referrals: (must(list) ?? []) as Referral[], medicoId: current?.id ?? null, activeDoctors: new Set((must(doctors) ?? []).map((d: { id: string }) => d.id)) };
  }, [clinicId]);

  const all = data?.referrals ?? [];
  const medicoId = data?.medicoId ?? null;
  const referrals = all.filter(r => filter === 'todos' || r.status === filter);
  const canUpdate = (r: Referral) => isAdmin || Boolean(medicoId && (r.medico_origem_id === medicoId || r.medico_destino_id === medicoId));
  const count = (s: string) => all.filter(r => r.status === s).length;

  async function open(r: Referral) {
    if (openId === r.id) { setOpenId(null); return; }
    setOpenId(r.id); setHistory(null); setContraRef(r.contra_referencia ?? ''); setFeedback(null); setBusy(`open:${r.id}`);
    try {
      // Audit the read before showing clinical content, same RPC the web uses for clinical documents.
      const audit = must(await db.rpc('registrar_acesso_documento_clinico', { p_tipo: 'encaminhamento', p_documento_id: r.id, p_acao: 'visualizacao' }));
      if (!audit) throw new Error('A auditoria não confirmou o acesso ao documento.');
      setHistory((must(await db.from('encaminhamento_status_history').select('id,status_anterior,status_novo,usuario_nome,comentario,data_mudanca').eq('encaminhamento_id', r.id).order('data_mudanca', { ascending: false })) ?? []) as History[]);
    } catch (err) { setOpenId(null); setFeedback({ message: friendlyError(err, 'Não foi possível abrir este encaminhamento.'), error: true }); } finally { setBusy(null); }
  }

  async function setStatus(r: Referral, status: 'em_andamento' | 'cancelado') {
    if (!clinicId || !canUpdate(r)) return;
    const expected = status === 'em_andamento' ? ['pendente'] : ['pendente', 'em_andamento'];
    if (!expected.includes(r.status ?? '')) return setFeedback({ message: 'O encaminhamento mudou de estado. Atualize a lista e tente novamente.', error: true });
    setBusy(r.id);
    try {
      const changes: Record<string, unknown> = { status };
      if (status === 'em_andamento') changes.data_atendimento = clinicDate();
      const row = must(await db.from('encaminhamentos').update(changes).eq('id', r.id).eq('clinica_id', clinicId).in('status', expected).select('id').maybeSingle());
      if (!row) throw new Error('O encaminhamento foi alterado em outra sessão. Atualize a lista antes de tentar novamente.');
      setFeedback({ message: `Status atualizado para "${statusLabel[status]}"` });
      setOpenId(null);
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao atualizar status'), error: true }); reload(); } finally { setBusy(null); }
  }

  function confirmCancel(r: Referral) {
    Alert.alert('Cancelar encaminhamento', 'Cancelar este encaminhamento? Ele deixará de aceitar contra-referência.', [
      { text: 'Voltar', style: 'cancel' }, { text: 'Cancelar encaminhamento', style: 'destructive', onPress: () => void setStatus(r, 'cancelado') },
    ]);
  }

  async function saveContraRef(r: Referral) {
    if (!clinicId || !contraRef.trim()) return;
    if (!r.updated_at) return setFeedback({ message: 'Não foi possível confirmar a versão deste encaminhamento. Atualize a lista e abra o registro novamente.', error: true });
    if (contraRef.trim().length > 10000) return setFeedback({ message: 'A contra-referência deve ter no máximo 10.000 caracteres.', error: true });
    setBusy(r.id);
    try {
      const row = must(await db.from('encaminhamentos').update({ contra_referencia: contraRef, data_contra_referencia: clinicDate(), status: 'concluido', data_atendimento: r.data_atendimento || clinicDate() })
        .eq('id', r.id).eq('clinica_id', clinicId).eq('updated_at', r.updated_at).in('status', ['pendente', 'em_andamento']).select('id').maybeSingle());
      if (!row) throw new Error('O encaminhamento foi alterado em outra sessão. Seu texto continua nesta tela; atualize o registro e confira o histórico antes de salvar novamente.');
      setFeedback({ message: 'Contra-referência registrada! Encaminhamento concluído.' });
      setOpenId(null);
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao salvar contra-referência'), error: true }); } finally { setBusy(null); }
  }

  async function create() {
    if (!form || !clinicId) return;
    if (!form.paciente) return setFeedback({ message: 'Selecione o paciente.', error: true });
    if (!form.especialidade || !form.motivo.trim()) return setFeedback({ message: 'Preencha a especialidade e o motivo do encaminhamento.', error: true });
    if (!medicoId) return setFeedback({ message: 'Vincule seu usuário a um médico antes de criar encaminhamentos.', error: true });
    if (!data?.activeDoctors.has(medicoId)) return setFeedback({ message: 'O profissional precisa estar ativo nesta clínica para emitir encaminhamentos.', error: true });
    if (form.motivo.trim().length > 10000) return setFeedback({ message: 'Use no máximo 10.000 caracteres no motivo.', error: true });
    setBusy('new');
    try {
      must(await db.from('encaminhamentos').insert({
        clinica_id: clinicId, paciente_id: form.paciente.id, prontuario_id: null, medico_origem_id: medicoId, medico_destino_id: null,
        especialidade_destino: form.especialidade, tipo: 'referencia', urgencia: form.urgencia, motivo: form.motivo.trim(),
        hipotese_diagnostica: form.hipotese.trim() || null, cid_principal: form.cid.trim() || null, exames_realizados: form.exames.trim() || null,
        tratamento_atual: form.tratamento.trim() || null, informacoes_adicionais: form.informacoes.trim() || null, status: 'pendente', data_encaminhamento: clinicDate(),
      }));
      setForm(null);
      setFeedback({ message: 'O encaminhamento foi registrado com sucesso.' });
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); }
  }

  return <ModuleScreen moduleKey="encaminhamentos" subtitle={all.length ? `${all.length} encaminhamento(s) · ${count('pendente')} pendente(s) · ${count('concluido')} concluído(s)` : 'Referências e contra-referências médicas'} refreshing={refreshing} onRefresh={refresh}
    action={form || !medicoId ? null : <Button label="Novo" icon="add" onPress={() => { setForm(emptyForm); setFeedback(null); }} />}>
    {form ? <Card style={styles.form}>
      <PatientPicker value={form.paciente} onChange={paciente => setForm({ ...form, paciente })} />
      <Chips label="Especialidade *" options={especialidades} value={form.especialidade || null} onChange={especialidade => setForm({ ...form, especialidade })} />
      <Chips label="Urgência" options={urgencias} value={form.urgencia} onChange={urgencia => setForm({ ...form, urgencia })} />
      <Field label="Motivo *" value={form.motivo} onChangeText={motivo => setForm({ ...form, motivo })} multiline />
      <Field label="Hipótese diagnóstica" value={form.hipotese} onChangeText={hipotese => setForm({ ...form, hipotese })} />
      <Field label="CID principal" value={form.cid} onChangeText={cid => setForm({ ...form, cid })} autoCapitalize="characters" hint="Opcional" />
      <Field label="Exames realizados" value={form.exames} onChangeText={exames => setForm({ ...form, exames })} multiline />
      <Field label="Tratamento atual" value={form.tratamento} onChangeText={tratamento => setForm({ ...form, tratamento })} multiline />
      <Field label="Informações adicionais" value={form.informacoes} onChangeText={informacoes => setForm({ ...form, informacoes })} multiline />
      <Text style={styles.note}>Para indicar um médico de destino específico ou vincular a um prontuário, use o navegador.</Text>
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setForm(null)} /><Button label="Criar encaminhamento" icon="checkmark" loading={busy === 'new'} onPress={() => void create()} /></View>
    </Card> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Chips options={[{ value: 'todos', label: 'Todos' }, { value: 'pendente', label: 'Pendentes' }, { value: 'em_andamento', label: 'Em andamento' }, { value: 'concluido', label: 'Concluídos' }, { value: 'cancelado', label: 'Cancelados' }]} value={filter} onChange={setFilter} />
    {loading ? <StateView loading title="Carregando encaminhamentos…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar encaminhamentos" message={error} onAction={reload} /> : !referrals.length ? <StateView icon="swap-horizontal-outline" title="Nenhum encaminhamento" message={filter === 'todos' ? 'Ainda não há encaminhamentos registrados.' : 'Nenhum encaminhamento neste filtro.'} /> :
      <Section title={`${referrals.length} encaminhamento(s)`}>{referrals.map(r => {
        const expanded = openId === r.id && history !== null;
        const active = r.status !== 'concluido' && r.status !== 'cancelado';
        return <View key={r.id} style={styles.item}>
          <ListRow title={`${patientName(r.paciente)} → ${r.especialidade_destino}`} subtitle={r.motivo} onPress={() => void open(r)} accessibilityLabel={`Abrir encaminhamento de ${patientName(r.paciente)}`}
            meta={[dateLabel(r.data_encaminhamento), urgencias.find(u => u.value === r.urgencia)?.label ?? 'Normal', r.medico_origem ? `Origem: ${r.medico_origem.nome || `CRM ${r.medico_origem.crm}`}` : null].filter(Boolean).join(' · ')}
            right={busy === `open:${r.id}` ? <Badge label="Abrindo…" /> : <Badge label={statusLabel[r.status ?? ''] ?? r.status ?? '—'} tone={statusTone[r.status ?? ''] ?? 'neutral'} />} />
          {expanded ? <Card style={styles.detail}>
            <Info label="Motivo" value={r.motivo} /><Info label="Hipótese diagnóstica" value={r.hipotese_diagnostica} /><Info label="CID principal" value={r.cid_principal} />
            <Info label="Exames realizados" value={r.exames_realizados} /><Info label="Tratamento atual" value={r.tratamento_atual} /><Info label="Informações adicionais" value={r.informacoes_adicionais} />
            <Text style={styles.label}>Histórico do encaminhamento</Text>
            {history?.length ? history.map(h => <Text key={h.id} style={styles.history}>{h.status_anterior ? `${statusLabel[h.status_anterior] ?? h.status_anterior} → ` : ''}{statusLabel[h.status_novo] ?? h.status_novo} · {h.usuario_nome || 'Usuário da clínica'} · {dateLabel(h.data_mudanca)}{h.comentario ? `\n${h.comentario}` : ''}</Text>) : <Text style={styles.history}>Ainda não há alterações de status registradas.</Text>}
            {r.contra_referencia ? <Info label={`Contra-referência${r.data_contra_referencia ? ` · ${dateLabel(r.data_contra_referencia)}` : ''}`} value={r.contra_referencia} /> : active && canUpdate(r) ? <>
              <Field label="Registrar contra-referência" value={contraRef} onChangeText={setContraRef} multiline placeholder="Informe o retorno do especialista, condutas sugeridas, diagnóstico final..." />
              <Button label="Salvar e Concluir" icon="checkmark-circle-outline" disabled={!contraRef.trim()} loading={busy === r.id} onPress={() => void saveContraRef(r)} />
            </> : null}
            {active && canUpdate(r) ? <View style={styles.rowActions}>
              {r.status === 'pendente' ? <Button variant="secondary" label="Marcar Em Andamento" disabled={busy === r.id} onPress={() => void setStatus(r, 'em_andamento')} /> : null}
              <Button variant="danger" label="Cancelar Encaminhamento" disabled={busy === r.id} onPress={() => confirmCancel(r)} />
            </View> : null}
            {!canUpdate(r) && active ? <Text style={styles.note}>Somente os médicos envolvidos ou a administração podem atualizar este encaminhamento.</Text> : null}
          </Card> : null}
        </View>;
      })}</Section>}
    {!loading && !medicoId ? <Text style={styles.note}>A criação de encaminhamentos exige uma conta vinculada a um médico ativo.</Text> : null}
    <View style={styles.web}><OpenOnWeb path="/documentos-clinicos?tab=encaminhamentos" /></View>
  </ModuleScreen>;
}

function Info({ label, value }: { label: string; value: string | null }) {
  return value?.trim() ? <View style={styles.info}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View> : null;
}

/** Same RLS-scoped search RPC used by the Patients tab. */
function PatientPicker({ value, onChange }: { value: Patient | null; onChange: (p: Patient | null) => void }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function search() {
    if (term.trim().length < 2) return setErr('Digite ao menos 2 caracteres.');
    setSearching(true); setErr(null);
    try {
      setResults((must(await db.rpc('buscar_pacientes_paginado', { p_termo: term.trim(), p_limite: 20, p_offset: 0, p_status: 'ativos', p_sexo: null, p_convenio_id: null, p_somente_particular: false, p_nascimento_apos: null, p_nascimento_ate: null }).select('id,nome,nome_social')) ?? []) as Patient[]);
    } catch (e) { setErr(friendlyError(e, 'Não foi possível buscar pacientes')); } finally { setSearching(false); }
  }
  if (value) return <View style={styles.field}><Text style={styles.label}>Paciente *</Text><ListRow title={patientName(value)} icon="person-outline" right={<Button variant="ghost" label="Trocar" onPress={() => onChange(null)} />} /></View>;
  return <View style={styles.field}>
    <Field label="Paciente *" value={term} onChangeText={setTerm} placeholder="Nome, CPF ou telefone" returnKeyType="search" onSubmitEditing={() => void search()} error={err ?? undefined} autoCorrect={false} />
    <Button variant="secondary" label="Buscar paciente" icon="search-outline" loading={searching} onPress={() => void search()} />
    {results ? results.length ? results.map(p => <ListRow key={p.id} title={patientName(p)} onPress={() => { onChange(p); setResults(null); setTerm(''); }} />) : <Text style={styles.note}>Nenhum paciente corresponde à busca.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  form: { marginBottom: 6 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, item: { marginBottom: 6 }, detail: { marginTop: 8 }, rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10 },
  field: { marginBottom: 14 }, info: { marginBottom: 10 }, label: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 4 }, value: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  history: { color: colors.ink, fontSize: 11, lineHeight: 16, marginBottom: 6 }, note: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginVertical: 10 }, web: { marginTop: 16 },
});
