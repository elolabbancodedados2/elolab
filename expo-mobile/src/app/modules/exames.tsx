import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, StateView, Stat, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Status = 'solicitado' | 'agendado' | 'realizado' | 'laudo_disponivel' | 'cancelado';
type Exam = {
  id: string; paciente_id: string; medico_solicitante_id: string | null; tipo_exame: string; tipo_categorizado: string | null; status: Status | null;
  data_solicitacao: string | null; data_realizacao: string | null; descricao: string | null; resultado: string | null; observacoes: string | null; arquivo_resultado: string | null;
  pacientes: { nome: string | null; nome_social: string | null } | null; medicos: { nome: string | null; crm: string | null; especialidade: string | null } | null;
};
type Indicator = 'todos' | 'aguardando' | 'hoje' | 'agendado' | 'laudo_disponivel' | 'criticos';

const BUCKET = 'medical-attachments';
// shortcut: the web pages through up to 20,000 exams; the phone loads the latest 300, open the web for older history.
const LIMIT = 300;
const statusLabel: Record<Status, string> = { solicitado: 'Solicitado', agendado: 'Agendado', realizado: 'Realizado', laudo_disponivel: 'Laudo Disponível', cancelado: 'Cancelado' };
const statusTone: Record<Status, Tone> = { solicitado: 'warning', agendado: 'primary', realizado: 'info', laudo_disponivel: 'success', cancelado: 'neutral' };
const nextLabel: Partial<Record<Status, string>> = { solicitado: 'Agendar Coleta', agendado: 'Marcar Realizado' };
const indicators: { value: Indicator; label: string }[] = [
  { value: 'todos', label: 'Todos' }, { value: 'aguardando', label: 'Aguardando resultado' }, { value: 'hoje', label: 'Solicitados hoje' },
  { value: 'agendado', label: 'Agendados / coleta' }, { value: 'laudo_disponivel', label: 'Resultados prontos' }, { value: 'criticos', label: 'Críticos' },
];
const statusOf = (exam: Exam): Status => exam.status ?? 'solicitado';
const isLab = (exam: Exam) => (exam.tipo_categorizado ?? '').trim().toLocaleLowerCase('pt-BR') === 'laboratorial';
const patientName = (exam: Exam) => exam.pacientes?.nome_social?.trim() || exam.pacientes?.nome || 'Desconhecido';
const normalize = (value: string | null | undefined) => (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Same rules as proximaAcaoExame on the web (src/lib/examesWorkflow.ts). */
function nextAction(exam: Exam): { kind: 'status'; status: Status } | { kind: 'laboratorio' } | { kind: 'none' } {
  const status = statusOf(exam);
  if (status === 'laudo_disponivel' || status === 'cancelado') return { kind: 'none' };
  if (isLab(exam) && (status === 'agendado' || status === 'realizado')) return { kind: 'laboratorio' };
  const next: Partial<Record<Status, Status>> = { solicitado: 'agendado', agendado: 'realizado', realizado: 'laudo_disponivel' };
  return next[status] ? { kind: 'status', status: next[status] } : { kind: 'none' };
}

/** "Anexos: path1, path2" line written by the web guide; legacy rows may hold full URLs. */
function attachments(observacoes: string | null) {
  const line = observacoes?.split('\n').find(l => /^\s*Anexos:/i.test(l));
  if (!line) return [];
  return line.replace(/^\s*Anexos:\s*/i, '').split(',').map(item => item.trim()).filter(item => item && !/^\d+\s+arquivo/i.test(item))
    .map(item => !item.startsWith('http') ? item : item.split(`/${BUCKET}/`)[1] ? decodeURIComponent(item.split(`/${BUCKET}/`)[1].split('?')[0]) : item.split('/').slice(-3).join('/'));
}

export default function ExamsScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const roles = profile?.roles ?? [];
  const isDoctorOnly = roles.includes('medico') && !roles.includes('admin') && !roles.includes('recepcao') && !roles.includes('enfermagem');
  const canDelete = roles.includes('admin') || roles.includes('recepcao');
  const [indicator, setIndicator] = useState<Indicator>('todos');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    if (isDoctorOnly) {
      // Same gate as the web: a doctor-only account needs an active linked medical record.
      const doctor = (must<{ id: string; ativo: boolean | null }[]>(await client.rpc('buscar_medico_atual')) ?? [])[0];
      if (!doctor || doctor.ativo === false) return { exams: [] as Exam[], critical: new Set<string>(), criticalError: false, blocked: doctor ? 'inactive' : 'unlinked' };
    }
    const [exams, critical] = await Promise.all([
      client.from('exames').select('id, paciente_id, medico_solicitante_id, tipo_exame, tipo_categorizado, status, data_solicitacao, data_realizacao, descricao, resultado, observacoes, arquivo_resultado, pacientes(nome, nome_social), medicos(crm, especialidade, nome)')
        .eq('clinica_id', clinicId).order('data_solicitacao', { ascending: false }).order('id', { ascending: true }).limit(LIMIT),
      client.from('resultados_laboratorio').select('exame_id').eq('clinica_id', clinicId).eq('critico', true).not('exame_id', 'is', null),
    ]);
    // Critical results are auxiliary on the web too: a failure only hides the indicator.
    const criticalIds = new Set<string>(critical.error ? [] : (critical.data ?? []).map((row: { exame_id: string }) => row.exame_id));
    return { exams: (must(exams) ?? []) as Exam[], critical: criticalIds, criticalError: Boolean(critical.error), blocked: null as string | null };
  }, [clinicId, isDoctorOnly]);

  const all = data?.exams ?? [];
  const matches = (exam: Exam, key: Indicator) => key === 'aguardando' ? ['solicitado', 'agendado', 'realizado'].includes(statusOf(exam)) : key === 'hoje' ? exam.data_solicitacao === today
    : key === 'agendado' ? exam.status === 'agendado' : key === 'laudo_disponivel' ? exam.status === 'laudo_disponivel' : key === 'criticos' ? Boolean(data?.critical.has(exam.id)) : true;
  const count = (key: Indicator) => all.filter(exam => matches(exam, key)).length;
  const term = normalize(search);
  const exams = all.filter(exam => matches(exam, indicator) && (!term || normalize(patientName(exam)).includes(term) || normalize(exam.tipo_exame).includes(term)));

  // Mirrors autoProgressExame for the transitions a phone can do: status guard on the current value, coleta sync and automation log.
  async function progress(exam: Exam, status: Status) {
    if (!clinicId || busy) return;
    setBusy(exam.id);
    setFeedback(null);
    let updated = false;
    try {
      const patient = must(await db.from('pacientes').select('nome').eq('id', exam.paciente_id).eq('clinica_id', clinicId).maybeSingle());
      if (!patient) throw new Error('Não foi possível carregar os dados do paciente para atualizar o exame.');
      const changes: Record<string, unknown> = { status };
      if (status === 'realizado') changes.data_realizacao = today;
      const row = must(await db.from('exames').update(changes).eq('id', exam.id).eq('clinica_id', clinicId).eq('status', statusOf(exam)).select('id').maybeSingle());
      if (!row) throw new Error('Exame não encontrado para atualização. Atualize a lista e tente novamente.');
      updated = true;
      if (status === 'realizado') must(await db.from('coletas_laboratorio').update({ status: 'em_analise' }).eq('exame_id', exam.id).in('status', ['pendente', 'coletado']));
      must(await db.from('automation_logs').insert({ tipo: 'exame', nome: `Progresso Exame: ${exam.tipo_exame}`, status: 'sucesso', registros_processados: 1, registros_sucesso: 1, detalhes: { exame_id: exam.id, novo_status: status } }));
      setFeedback({ message: status === 'cancelado' ? 'Solicitação cancelada.' : 'Status atualizado!' });
    } catch (err) {
      setFeedback(updated ? { message: `Status do exame atualizado; uma etapa complementar falhou: ${friendlyError(err)}`, error: true } : { message: friendlyError(err, 'Erro ao atualizar status'), error: true });
    } finally { setBusy(null); reload(); }
  }

  function cancel(exam: Exam) {
    Alert.alert('Cancelar solicitação de exame?', `A solicitação de ${exam.tipo_exame || 'este exame'} será marcada como cancelada e sairá do fluxo de atendimento. O histórico permanecerá registrado.`, [
      { text: 'Manter exame', style: 'cancel' },
      { text: 'Cancelar solicitação', style: 'destructive', onPress: () => void progress(exam, 'cancelado') },
    ]);
  }

  function remove(exam: Exam) {
    Alert.alert('Excluir solicitação de exame?', 'Esta exclusão é permanente e remove o exame da lista da clínica.', [
      { text: 'Manter exame', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => void (async () => {
        setBusy(exam.id);
        setFeedback(null);
        try {
          const row = must(await db.from('exames').delete().eq('id', exam.id).eq('clinica_id', clinicId).select('id').maybeSingle());
          setFeedback(row ? { message: 'Exame excluído!' } : { message: 'Não foi possível excluir: o exame não pertence à clínica atual ou já foi removido.', error: true });
        } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao excluir exame'), error: true }); } finally { setBusy(null); reload(); }
      })() },
    ]);
  }

  // Private bucket: open a temporary signed link, like the web attachment button.
  async function openFile(path: string) {
    setBusy(path);
    try {
      const { data: signed, error: signError } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (signError || !signed?.signedUrl) throw signError ?? new Error('O link do arquivo não foi gerado.');
      await Linking.openURL(signed.signedUrl);
    } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível abrir o arquivo.'), error: true }); } finally { setBusy(null); }
  }

  const subtitle = all.length ? `${count('hoje')} solicitado(s) hoje · ${count('aguardando')} aguardando resultado · ${count('laudo_disponivel')} resultado(s) pronto(s)` : 'Crie guias e acompanhe cada exame até a liberação do laudo.';
  return <ModuleScreen moduleKey="exames" title="Solicitação de exames" subtitle={subtitle} refreshing={refreshing} onRefresh={refresh}>
    {loading ? <StateView loading title="Carregando exames…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as solicitações de exames" message={error} onAction={reload} />
      : data?.blocked ? <StateView icon="lock-closed-outline" title={data.blocked === 'inactive' ? 'Cadastro médico inativo' : 'Perfil médico sem vínculo'} message={data.blocked === 'inactive' ? 'Seu cadastro médico foi inativado. Peça ao administrador para revisar seu acesso antes de consultar ou solicitar exames.' : 'Seu usuário não está vinculado a um cadastro médico ativo da clínica. Peça ao administrador para revisar esse vínculo antes de consultar ou solicitar exames.'} /> : <>
      <Card style={styles.handoff}><Text style={styles.note}>Nova guia de exames, lançamento de resultado e liberação de laudo (com cobrança e vínculo ao prontuário) são feitos no navegador.</Text><OpenOnWeb path="/exames" label="Nova guia no navegador" /></Card>
      <View style={styles.stats}>
        <Stat label="Aguardando resultado" value={count('aguardando')} onPress={() => setIndicator('aguardando')} />
        <Stat label="Resultados prontos" value={count('laudo_disponivel')} tone="success" onPress={() => setIndicator('laudo_disponivel')} />
        <Stat label={data?.criticalError ? 'Críticos (não foi possível conferir)' : 'Críticos'} value={count('criticos')} tone="danger" onPress={() => setIndicator('criticos')} />
        <Stat label="Solicitados hoje" value={count('hoje')} tone="info" onPress={() => setIndicator('hoje')} />
      </View>
      {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
      <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Buscar paciente ou exame..." autoCorrect={false} />
      <Chips label="Situação" options={indicators} value={indicator} onChange={setIndicator} />
      {all.length >= LIMIT ? <Text style={styles.note}>Mostrando os {LIMIT} exames mais recentes. Solicitações mais antigas estão no navegador.</Text> : null}
      {!exams.length ? <StateView icon="flask-outline" title="Nenhum exame encontrado" message={all.length ? 'Nenhum exame corresponde à busca ou ao filtro.' : 'Nenhuma solicitação de exame registrada.'} /> :
        <Section title={`${exams.length} exame(s)`}>{exams.map(exam => {
          const status = statusOf(exam);
          const action = nextAction(exam);
          const critical = data?.critical.has(exam.id);
          const files = attachments(exam.observacoes);
          const open = openId === exam.id;
          const notes = exam.observacoes?.split('\n').filter(l => !/^\s*Anexos:/i.test(l)).join('\n').trim();
          const doctor = exam.medicos ? `${exam.medicos.nome || exam.medicos.crm} - ${exam.medicos.especialidade || 'Clínico'}` : 'Sem solicitante';
          return <View key={exam.id} style={styles.exam}>
            <ListRow title={patientName(exam)} subtitle={exam.tipo_exame} meta={[dateLabel(exam.data_solicitacao), doctor].join(' · ')} icon="flask-outline" tone={critical ? 'danger' : 'primary'}
              accessibilityLabel={`${patientName(exam)}, ${exam.tipo_exame}, ${statusLabel[status]}`} onPress={() => setOpenId(open ? null : exam.id)}
              right={<View style={styles.badges}><Badge label={statusLabel[status]} tone={statusTone[status]} />{critical ? <Badge label="Crítico" tone="danger" /> : null}</View>} />
            {open ? <View style={styles.detail}>
              {exam.data_realizacao ? <Text style={styles.label}>Data Realização: <Text style={styles.value}>{dateLabel(exam.data_realizacao)}</Text></Text> : null}
              {exam.descricao ? <><Text style={styles.label}>Detalhes</Text><Text selectable style={styles.value}>{exam.descricao}</Text></> : null}
              {exam.resultado ? <><Text style={styles.label}>Resultado</Text><Text selectable style={styles.value}>{exam.resultado}</Text></> : null}
              {notes ? <><Text style={styles.label}>Observações</Text><Text selectable style={styles.value}>{notes}</Text></> : null}
              {files.map((path, index) => <Button key={path} variant="secondary" icon="attach-outline" label={`Abrir anexo ${index + 1} da guia`} loading={busy === path} disabled={Boolean(busy)} onPress={() => void openFile(path)} />)}
              {exam.arquivo_resultado ? <Button variant="secondary" icon="document-outline" label="Abrir laudo" loading={busy === exam.arquivo_resultado} disabled={Boolean(busy)} onPress={() => void openFile(exam.arquivo_resultado!)} /> : null}
            </View> : null}
            <View style={styles.actions}>
              {action.kind === 'status' && action.status !== 'laudo_disponivel' ? <Button label={nextLabel[status] ?? 'Avançar'} loading={busy === exam.id} disabled={Boolean(busy)} onPress={() => void progress(exam, action.status)} /> : null}
              {action.kind === 'status' && action.status === 'laudo_disponivel' ? <OpenOnWeb path="/exames" label={exam.resultado?.trim() || exam.arquivo_resultado ? 'Liberar laudo no navegador' : 'Lançar resultado no navegador'} /> : null}
              {action.kind === 'laboratorio' || (isLab(exam) && status !== 'cancelado' && status !== 'laudo_disponivel') ? <OpenOnWeb path="/laboratorio" label={action.kind === 'laboratorio' ? 'Abrir Laboratório' : 'Coleta no Laboratório'} /> : null}
              {!isLab(exam) && status !== 'cancelado' && status !== 'laudo_disponivel' ? <Button variant="ghost" label="Cancelar" disabled={Boolean(busy)} onPress={() => cancel(exam)} /> : null}
              {canDelete ? <Button variant="danger" label="Excluir" disabled={Boolean(busy)} onPress={() => remove(exam)} /> : null}
            </View>
          </View>;
        })}</Section>}
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  handoff: { gap: 10, marginBottom: 12 }, note: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  exam: { marginBottom: 6 }, badges: { alignItems: 'flex-end', gap: 4 },
  detail: { gap: 6, paddingVertical: 10 }, label: { color: colors.muted, fontSize: 11, fontWeight: '700' }, value: { color: colors.ink, fontSize: 12, lineHeight: 18, fontWeight: '400' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
});
