import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Feedback, ListRow, Section, Stat, StateView } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Report = { id: string; nome: string; descricao: string | null; dataset: string; frequencia: string | null; ativo: boolean; destinatarios: string[] | null; proxima_execucao: string | null; ultima_execucao: string | null };
type Filtro = 'todos' | 'agendados' | 'favoritos' | 'pausados';
type RunResult = { id: string; skipped?: string; delivery?: string; sent_to?: number };

const LIMIT = 20000;
const matches = (r: Report, f: Filtro) => f === 'todos' || (f === 'agendados' && !!r.frequencia && r.ativo) || (f === 'favoritos' && !r.frequencia) || (f === 'pausados' && !!r.frequencia && !r.ativo);
async function fetchAll<T>(build: () => Db): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < LIMIT) {
    const batch = (must<T[]>(await build().range(rows.length, rows.length + 999)) ?? []);
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}
/** Same outcome messages as RelatoriosSalvos.runNow on the web. */
function runMessage(r: RunResult | undefined): { message: string; error?: boolean } {
  if (!r) return { message: 'O servidor não confirmou a execução deste relatório.', error: true };
  if (r.skipped === 'sem_permissao_para_fonte') return { message: 'Relatório não executado: o responsável pelo relatório não tem acesso à fonte de dados selecionada.', error: true };
  if (r.skipped === 'em_execucao') return { message: 'Relatório já está em processamento. Aguarde a conclusão da execução atual antes de tentar novamente.', error: true };
  if (r.skipped) return { message: 'Relatório não executado: a fonte de dados salva não é válida para este relatório.', error: true };
  if (r.delivery === 'recipients_invalid') return { message: 'Relatório não enviado: um ou mais destinatários foram desativados ou perderam acesso à fonte. Edite a lista antes da próxima execução.', error: true };
  if (r.delivery === 'not_configured' || !r.sent_to) return { message: 'Relatório não enviado. Confira os destinatários e a configuração de envio de e-mail da clínica.', error: true };
  return { message: `Relatório enviado para ${r.sent_to} destinatário(s).` };
}

export default function SavedReportsScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    return fetchAll<Report>(() => client.from('relatorios_salvos').select('*').eq('clinica_id', clinicId).order('created_at', { ascending: false }).order('id', { ascending: true }));
  }, [clinicId]);

  const items = data ?? [];
  const counts = { todos: items.length, agendados: items.filter(r => matches(r, 'agendados')).length, favoritos: items.filter(r => matches(r, 'favoritos')).length, pausados: items.filter(r => matches(r, 'pausados')).length };
  const visible = items.filter(r => matches(r, filtro));

  async function run(r: Report) {
    setBusy(r.id); setFeedback(null);
    try {
      const { data: res, error: fnError } = await db.functions.invoke('scheduled-reports-runner', { body: { id: r.id } });
      if (fnError) throw fnError;
      setFeedback(runMessage((res?.out as RunResult[] | undefined)?.find(item => item.id === r.id)));
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Falha ao executar.'), error: true }); } finally { setBusy(null); }
  }

  async function toggle(r: Report) {
    setBusy(r.id); setFeedback(null);
    try {
      const row = must(await db.from('relatorios_salvos').update({ ativo: !r.ativo }).eq('id', r.id).eq('clinica_id', clinicId).select('id').maybeSingle());
      if (!row) throw new Error('Relatório não encontrado ou sem permissão para alterar.');
      setFeedback({ message: r.ativo ? 'Agendamento pausado.' : 'Agendamento ativado.' });
      reload();
    } catch (err) { setFeedback({ message: `Não foi possível alterar o agendamento do relatório. ${friendlyError(err)}`, error: true }); } finally { setBusy(null); }
  }

  function remove(r: Report) {
    Alert.alert('Excluir relatório', `Excluir "${r.nome}"? Esta ação não pode ser desfeita.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => void (async () => {
        setBusy(r.id);
        try {
          const rows = must<{ id: string }[]>(await db.from('relatorios_salvos').delete().eq('id', r.id).eq('clinica_id', clinicId).select('id'));
          if (!rows?.length) throw new Error('Relatório não encontrado ou sem permissão para excluir.');
          setFeedback({ message: 'Excluído.' });
          reload();
        } catch (err) { setFeedback({ message: `Não foi possível excluir o relatório. ${friendlyError(err)}`, error: true }); } finally { setBusy(null); }
      })() },
    ]);
  }

  return <ModuleScreen moduleKey="relatorios-salvos" title="Relatórios salvos e agendados" subtitle={items.length ? `${items.length} relatório(s) · ${counts.agendados} agendado(s) · ${counts.pausados} pausado(s)` : 'Reaproveite filtros favoritos e receba relatórios por e-mail automaticamente.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {!clinicId ? <StateView icon="business-outline" title="Clínica não identificada" message="Os relatórios salvos não podem ser exibidos sem identificar a clínica atual." />
      : loading ? <StateView loading title="Carregando relatórios salvos…" />
      : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os relatórios salvos" message={error} onAction={reload} />
      : !items.length ? <StateView icon="star-outline" title="Nenhum relatório salvo ainda" message="Monte um relatório personalizado no navegador para guardar seus filtros como favorito ou programar o envio por e-mail." /> : <>
        {items.length >= LIMIT ? <Text accessibilityRole="alert" style={styles.warn}>A lista atingiu o limite de {LIMIT.toLocaleString('pt-BR')} relatórios salvos. Itens mais antigos podem não aparecer.</Text> : null}
        <View style={styles.stats}>
          <Stat label="Salvos · todos os relatórios" value={counts.todos} onPress={() => setFiltro('todos')} />
          <Stat label="Agendados · envio automático ativo" value={counts.agendados} onPress={() => setFiltro('agendados')} />
          <Stat label="Favoritos · sem agendamento" value={counts.favoritos} tone="info" onPress={() => setFiltro('favoritos')} />
          <Stat label="Pausados · agendamento suspenso" value={counts.pausados} tone="warning" onPress={() => setFiltro('pausados')} />
        </View>
        <Section title={`${visible.length} de ${items.length}`} action={filtro !== 'todos' ? <Button variant="ghost" label="Limpar filtro" onPress={() => setFiltro('todos')} /> : undefined}>
          {!visible.length ? <StateView icon="filter-outline" title="Nenhum relatório neste filtro." /> : visible.map(r => <View key={r.id} style={styles.item}>
            <ListRow icon="document-text-outline" title={r.nome} subtitle={r.descricao}
              meta={[r.dataset, r.destinatarios?.length ? `${r.destinatarios.length} destinatário(s)` : null, r.proxima_execucao ? `Próxima: ${dateLabel(r.proxima_execucao)}` : null, r.ultima_execucao ? `Última: ${dateLabel(r.ultima_execucao)}` : null].filter(Boolean).join(' · ')}
              right={<View style={styles.badges}><Badge label={r.frequencia && r.destinatarios?.length ? 'CSV por e-mail' : 'Favorito'} />{r.frequencia ? <Badge label={r.ativo ? r.frequencia : 'Pausado'} tone={r.ativo ? 'primary' : 'warning'} /> : null}</View>} />
            <View style={styles.actions}>
              <Button variant="secondary" icon="play" label="Executar envio" loading={busy === r.id} disabled={!!busy || !r.destinatarios?.length} onPress={() => void run(r)} />
              {r.frequencia ? <Button variant="ghost" icon={r.ativo ? 'pause' : 'play-circle-outline'} label={r.ativo ? 'Pausar' : 'Ativar'} disabled={!!busy} onPress={() => void toggle(r)} /> : null}
              <Button variant="danger" label="Excluir" disabled={!!busy} onPress={() => remove(r)} />
            </View>
            {!r.destinatarios?.length ? <Text style={styles.hint}>Adicione destinatários no navegador para enviar.</Text> : null}
          </View>)}
        </Section>
      </>}
    <Section title="No navegador">
      <Text style={styles.note}>Criar relatórios, abrir os filtros salvos e editar destinatários ou a programação exigem o construtor de relatórios do navegador.</Text>
      <View style={styles.actions}><OpenOnWeb path="/relatorios/salvos" /><Button variant="ghost" icon="bar-chart-outline" label="Resumo de relatórios" onPress={() => router.push('/modules/relatorios' as Href)} /></View>
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, item: { marginBottom: 4 }, badges: { alignItems: 'flex-end', gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingVertical: 6 }, hint: { color: colors.muted, fontSize: 11, textAlign: 'right' },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 10 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
});
