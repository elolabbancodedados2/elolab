import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, StateView } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Same ceiling as the web worklist (PostgREST cuts silently at 1.000 rows).
const WORKLIST_CAP = 500;
type Result = { id: string; parametro: string | null; resultado: string | null; unidade: string | null; critico: boolean | null; liberado: boolean | null; numero_versao: number | null; valor_referencia_min: number | null; valor_referencia_max: number | null; valor_referencia_texto?: string | null; data_liberacao?: string | null; exames?: { tipo_exame: string | null } | null; confirmacoes?: { id: string; numero_versao: number; conduta?: string; confirmado_em?: string; confirmador?: { nome: string } | null }[] | null };
type Coleta = { id: string; codigo_amostra: string | null; status: string | null; created_at: string; data_coleta: string | null; urgente: boolean | null; pacientes: { nome: string; nome_social: string | null; cpf: string | null } | null; resultados_laboratorio: Result[] | null };
type Filter = 'todos' | 'pendente' | 'parcial' | 'liberado' | 'alterado' | 'critico';

const filters: { value: Filter; label: string }[] = [{ value: 'todos', label: 'Todos' }, { value: 'pendente', label: 'Pendentes' }, { value: 'parcial', label: 'Parciais' }, { value: 'liberado', label: 'Liberados' }, { value: 'alterado', label: 'Alterados' }, { value: 'critico', label: 'Críticos' }];
const stageLabel: Record<string, string> = { pendente: 'Pendente', coletado: 'Coletado', em_analise: 'Em análise', validado: 'Validado', liberado: 'Liberado' };
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Same parser as the web: accepts "1.234,5", "12,3 mg/dL" and similar. */
function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^[-+]?(?:\d[\d\s.,]*|\.\d+)/);
  if (!match) return null;
  const token = match[0].replace(/\s/g, '');
  const comma = token.lastIndexOf(','), dot = token.lastIndexOf('.');
  let n = token;
  if (comma >= 0 && dot >= 0) n = comma > dot ? token.replace(/\./g, '').replace(',', '.') : token.replace(/,/g, '');
  else if (comma >= 0) n = token.replace(/,/g, (_c, offset) => (offset === comma ? '.' : ''));
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : null;
}
const altered = (r: Result) => { const n = numeric(r.resultado); return n !== null && ((r.valor_referencia_min != null && n < r.valor_referencia_min) || (r.valor_referencia_max != null && n > r.valor_referencia_max)); };
const criticalPending = (r: Result) => r.critico === true && typeof r.numero_versao === 'number' && !(r.confirmacoes ?? []).some(c => c.numero_versao === r.numero_versao);
const results = (c: Coleta) => c.resultados_laboratorio ?? [];
const released = (c: Coleta) => results(c).filter(r => r.liberado === true).length;
const pending = (c: Coleta) => results(c).filter(r => r.liberado !== true).length;
const patientName = (c: Coleta) => c.pacientes?.nome_social?.trim() || c.pacientes?.nome || '—';
const reference = (r: Result) => {
  if (r.valor_referencia_texto?.trim()) return r.valor_referencia_texto.trim();
  const min = r.valor_referencia_min ?? '', max = r.valor_referencia_max ?? '';
  const range = min !== '' && max !== '' ? `${min} a ${max}` : max !== '' ? `Até ${max}` : min !== '' ? `A partir de ${min}` : '';
  return range ? `${range} ${r.unidade ?? ''}`.trim() : 'Não informado';
};

/** Same path as the web helper: Edge Function with one retry, then notification_queue fallback. */
async function notifyReleased(resultId: string): Promise<'enviada' | 'enfileirada' | 'falhou'> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const { error } = await db.functions.invoke('exam-result-notification', { body: { resultado_id: resultId } }); if (!error) return 'enviada'; } catch { /* network failure: retry, then queue */ }
  }
  try {
    must(await db.from('notification_queue').insert({ tipo: 'email', status: 'pendente', dados_extras: { resultado_id: resultId, tipo: 'exam_result' }, conteudo: `Resultado de exame disponível - ID: ${resultId}`, assunto: 'Seu resultado de exame está disponível' }));
    return 'enfileirada';
  } catch { return 'falhou'; }
}

export default function LaudosScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const params = useLocalSearchParams<{ coleta?: string }>();
  const [selected, setSelected] = useState<string | null>(typeof params.coleta === 'string' ? params.coleta : null);
  const [filter, setFilter] = useState<Filter>('todos');
  const [search, setSearch] = useState('');

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const rows = must<Coleta[]>(await client.from('coletas_laboratorio')
      .select('id, codigo_amostra, status, created_at, data_coleta, urgente, pacientes(nome, nome_social, cpf), resultados_laboratorio(id, liberado, parametro, resultado, unidade, critico, numero_versao, valor_referencia_min, valor_referencia_max, exames(tipo_exame), confirmacoes:resultado_critico_confirmacoes(id, numero_versao))')
      .eq('clinica_id', clinicId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(WORKLIST_CAP + 1)) ?? [];
    const list = rows.slice(0, WORKLIST_CAP).filter(c => results(c).length > 0).sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { list, truncated: rows.length > WORKLIST_CAP };
  }, [clinicId]);

  if (selected) return <LaudoDetail coletaId={selected} onBack={() => { setSelected(null); reload(); }} />;

  const all = data?.list ?? [];
  const q = normalize(search.trim());
  const visible = all.filter(c => {
    if (q && ![patientName(c), c.pacientes?.nome ?? '', c.pacientes?.cpf ?? '', c.codigo_amostra ?? '', ...results(c).map(r => r.parametro ?? '')].some(v => normalize(v).includes(q))) return false;
    if (filter === 'liberado') return released(c) > 0 && pending(c) === 0;
    if (filter === 'parcial') return released(c) > 0 && pending(c) > 0;
    if (filter === 'pendente') return pending(c) > 0 && released(c) === 0;
    if (filter === 'alterado') return results(c).some(altered);
    if (filter === 'critico') return results(c).some(r => r.critico === true);
    return true;
  });
  const criticalWaiting = all.filter(c => results(c).some(criticalPending)).length;

  return <ModuleScreen moduleKey="laudos" subtitle={criticalWaiting ? `${criticalWaiting} laudo(s) com resultado crítico aguardando ciência.` : 'Confira, valide e libere os resultados.'} refreshing={refreshing} onRefresh={refresh}>
    <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Paciente, código ou exame" autoCapitalize="none" />
    <Chips label="Situação" options={filters} value={filter} onChange={setFilter} />
    {loading ? <StateView loading title="Carregando laudos…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : !visible.length ? <StateView icon="document-text-outline" title={search || filter !== 'todos' ? 'Nenhum laudo corresponde à busca e ao status selecionados' : 'Nenhum laudo com resultados'} message="Os resultados lançados no laboratório aparecem aqui." /> :
      <Section title={`${visible.length} laudo(s)`}>{visible.map(c => {
        const crit = results(c).some(criticalPending), done = pending(c) === 0;
        return <ListRow key={c.id} icon="document-text-outline" tone={crit ? 'danger' : done ? 'success' : 'primary'} title={patientName(c)} subtitle={`${c.codigo_amostra ?? 'Sem código'} · ${stageLabel[c.status ?? ''] ?? c.status ?? '—'}${c.urgente ? ' · Urgente' : ''}`}
          meta={`${released(c)}/${results(c).length} liberado(s) · Entrada ${dateLabel(c.created_at)}`} onPress={() => setSelected(c.id)}
          right={<Badge label={crit ? 'Crítico' : done ? 'Liberado' : released(c) ? 'Parcial' : 'Pendente'} tone={crit ? 'danger' : done ? 'success' : released(c) ? 'warning' : 'neutral'} />} />;
      })}</Section>}
    {data?.truncated ? <Text style={styles.note}>Mostrando as {WORKLIST_CAP} coletas mais recentes. O histórico mais antigo está no navegador.</Text> : null}
  </ModuleScreen>;
}

function LaudoDetail({ coletaId, onBack }: { coletaId: string; onBack: () => void }) {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const roles = profile?.roles ?? [];
  const canAcknowledge = roles.some(r => r === 'admin' || r === 'medico');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [conduct, setConduct] = useState<Record<string, string>>({});

  const { data: coleta, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const row = must<Coleta | null>(await client.from('coletas_laboratorio')
      .select('id, codigo_amostra, status, created_at, data_coleta, urgente, pacientes(nome, nome_social, cpf), resultados_laboratorio(id, parametro, resultado, unidade, critico, numero_versao, valor_referencia_min, valor_referencia_max, valor_referencia_texto, liberado, data_liberacao, exames(tipo_exame), confirmacoes:resultado_critico_confirmacoes(id, numero_versao, conduta, confirmado_em, confirmador:profiles!resultado_critico_confirmacoes_confirmado_por_fkey(nome)))')
      .eq('id', coletaId).eq('clinica_id', clinicId).maybeSingle());
    if (!row) throw new Error('A coleta não foi encontrada ou não está acessível nesta clínica.');
    return row;
  }, [clinicId, coletaId]);

  // Release only after technical review (validado/liberado), same gate as the web.
  const reviewPending = !!coleta?.status && !['validado', 'liberado'].includes(coleta.status);
  const list = coleta ? results(coleta) : [];
  const pendingIds = list.filter(r => !r.liberado).map(r => r.id);

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key); setFeedback(null);
    try { setFeedback({ message: await action() }); } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); reload(); }
  }

  const validate = () => run('validar', async () => {
    if (coleta?.status !== 'em_analise') throw new Error('A coleta precisa estar em análise antes da validação.');
    if (!list.length) throw new Error('Inclua ao menos um resultado antes de validar a coleta.');
    must(await db.rpc('validar_coleta_laboratorio', { p_coleta_id: coletaId }));
    return 'Coleta validada e conferência registrada!';
  });

  function release(ids: string[]) {
    if (reviewPending) return setFeedback({ message: `Esta coleta ainda não foi validada. Situação atual: ${stageLabel[coleta?.status ?? ''] ?? coleta?.status}. Conclua a conferência técnica antes de liberar — o paciente é notificado assim que o resultado sai.`, error: true });
    Alert.alert(ids.length > 1 ? 'Liberar todos' : 'Liberar resultado', `Liberar ${ids.length} resultado(s)? O paciente será notificado.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Liberar', onPress: () => void run(ids.length > 1 ? 'todos' : ids[0], async () => {
        // The RPC releases results and updates the collection stage in one transaction.
        const done = (must<{ id: string }[]>(await db.rpc('liberar_resultados_laboratorio', { p_coleta_id: coletaId, p_resultado_ids: ids })) ?? []).map(r => r.id);
        if (!done.length) return ids.length > 1 ? 'Nenhum resultado pôde ser liberado.' : 'Este resultado já foi liberado por outra pessoa.';
        let queued = 0, failed = 0;
        for (const id of done) { const n = await notifyReleased(id); if (n === 'enfileirada') queued++; else if (n === 'falhou') failed++; }
        const parts = [`${done.length} de ${ids.length} resultado(s) liberado(s)`];
        if (done.length < ids.length) parts.push(`${ids.length - done.length} falhou(aram)`);
        if (queued) parts.push(`${queued} notificação(ões) na fila de reenvio`);
        if (failed) parts.push(`${failed} notificação(ões) falharam e exigem contato manual`);
        return parts.join(' · ');
      }) },
    ]);
  }

  const acknowledge = (r: Result) => run(r.id, async () => {
    const text = (conduct[r.id] ?? '').trim();
    if (text.length < 10 || text.length > 2000) throw new Error('Descreva a conduta com 10 a 2.000 caracteres.');
    must(await db.rpc('confirmar_ciencia_resultado_critico', { p_resultado_id: r.id, p_conduta: text }));
    setConduct(current => ({ ...current, [r.id]: '' }));
    return 'Ciência e conduta registradas para a versão atual do resultado.';
  });

  return <ModuleScreen moduleKey="laudos" title={coleta ? `Laudo — ${coleta.codigo_amostra ?? '…'}` : 'Laudo'} subtitle={coleta ? `${patientName(coleta)} · ${stageLabel[coleta.status ?? ''] ?? coleta.status ?? '—'}` : 'Carregando coleta.'} refreshing={refreshing} onRefresh={refresh}
    action={<Button variant="ghost" icon="list-outline" label="Lista" onPress={onBack} />}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando laudo…" /> : error || !coleta ? <StateView icon="alert-circle-outline" title="Não foi possível carregar este laudo" message={error ?? undefined} onAction={reload} /> : <>
      <Card>
        <Text style={styles.info}>CPF: {coleta.pacientes?.cpf ?? '—'}</Text>
        <Text style={styles.info}>Entrada: {dateLabel(coleta.created_at)} · Coleta: {dateLabel(coleta.data_coleta)}</Text>
        <Text style={styles.info}>{list.length - pendingIds.length}/{list.length} liberado(s){coleta.urgente ? ' · Urgente' : ''}</Text>
      </Card>
      <View style={styles.actions}>
        {coleta.status === 'em_analise' ? <Button variant="secondary" icon="shield-checkmark-outline" label="Validar coleta" loading={busy === 'validar'} disabled={!!busy || !list.length} onPress={() => void validate()} /> : null}
        {pendingIds.length ? <Button icon="checkmark-done" label={`Liberar todos (${pendingIds.length})`} loading={busy === 'todos'} disabled={!!busy || reviewPending} onPress={() => release(pendingIds)} /> : null}
      </View>
      {reviewPending && coleta.status !== 'em_analise' ? <Text style={styles.note}>Avance a coleta para &quot;Em análise&quot; antes de validar.</Text> : null}
      <Section title="Resultados">{list.map(r => {
        const ack = (r.confirmacoes ?? []).find(c => c.numero_versao === r.numero_versao);
        return <View key={r.id} style={styles.result}>
          <ListRow title={r.parametro ?? '—'} subtitle={`${r.resultado ?? '—'} ${r.unidade ?? ''} · Referência: ${reference(r)}`} meta={[r.exames?.tipo_exame, r.data_liberacao ? `Liberado em ${dateLabel(r.data_liberacao)}` : null].filter(Boolean).join(' · ') || null}
            right={<Badge label={r.critico ? 'Crítico' : altered(r) ? 'Alterado' : r.liberado ? 'Liberado' : 'Pendente'} tone={r.critico || altered(r) ? 'danger' : r.liberado ? 'success' : 'neutral'} />} />
          {r.critico ? ack ? <Text style={styles.info}>Conduta registrada por {ack.confirmador?.nome || 'profissional autorizado'} em {dateLabel(ack.confirmado_em)}: {ack.conduta}</Text>
            : canAcknowledge ? <View style={styles.ack}>
              <Field label="Conduta documentada pelo profissional responsável" value={conduct[r.id] ?? ''} onChangeText={text => setConduct(current => ({ ...current, [r.id]: text }))} multiline maxLength={2000} placeholder="Registre a conduta definida para este resultado." hint="Mínimo de 10 e máximo de 2.000 caracteres." />
              <Button variant="danger" icon="checkmark-circle-outline" label="Confirmar ciência" loading={busy === r.id} disabled={!!busy || (conduct[r.id] ?? '').trim().length < 10} onPress={() => void acknowledge(r)} />
            </View> : <Text style={styles.warn}>Resultado crítico aguardando ciência e conduta. Somente médico ou administrador da clínica pode registrar ciência e conduta.</Text> : null}
          {!r.liberado ? <View style={styles.actions}><Button variant="secondary" label="Liberar" loading={busy === r.id} disabled={!!busy || reviewPending} onPress={() => release([r.id])} /></View> : null}
        </View>;
      })}</Section>
      <Card style={styles.web}>
        <Text style={styles.info}>Impressão e download do laudo em PDF, observações do laudo impresso, retificação e histórico de versões ficam no navegador, onde há conferência lado a lado.</Text>
        <OpenOnWeb path={`/laudos-lab?coleta=${coletaId}`} label="Abrir laudo no navegador" />
      </Card>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  info: { color: colors.ink, fontSize: 12, lineHeight: 18, marginBottom: 6 }, warn: { color: colors.danger, fontSize: 12, lineHeight: 18, paddingVertical: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 }, result: { marginBottom: 6 }, ack: { paddingTop: 10 },
  web: { marginTop: 20, gap: 10 }, note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 12 },
});
