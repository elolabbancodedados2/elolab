import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Feedback, ListRow, Section, Segmented, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Same catalog as src/pages/Automacoes.tsx (AUTOMATIONS).
const AUTOMATIONS: { key: string; name: string; description: string; configurable?: boolean }[] = [
  { key: 'lembrete_consulta_24h', name: 'Lembrete de Consulta (24h)', description: 'Envia lembretes 24 horas antes da consulta' },
  { key: 'lembrete_consulta_2h', name: 'Lembrete de Consulta (2h)', description: 'Envia lembretes 2 horas antes da consulta' },
  { key: 'alerta_estoque_critico', name: 'Alerta de Estoque Crítico', description: 'Notifica quando itens estão abaixo do mínimo' },
  { key: 'faturamento_automatico', name: 'Faturamento Automático', description: 'Gera a cobrança no check-in ou ao finalizar o atendimento quando há preço cadastrado', configurable: false },
  { key: 'aniversariantes', name: 'Mensagens de Aniversário', description: 'Envia felicitações para pacientes' },
  { key: 'confirmacao_agendamento', name: 'Confirmação de Agendamento', description: 'Envia confirmação por WhatsApp quando o agendamento é criado' },
  { key: 'notificacao_resultado_exame', name: 'Notificação de Resultado de Exame', description: 'Envia aviso ao liberar o laudo por e-mail com modelo ativo ou WhatsApp com sessão conectada', configurable: false },
  { key: 'recibo_pagamento', name: 'Recibo de Pagamento', description: 'Envia o recibo por e-mail quando um pagamento é confirmado' },
];

type Setting = { id: string; chave: string; ativo: boolean | null; updated_at: string };
type Log = { id: string; tipo: string; nome: string; status: string; registros_processados: number | null; registros_sucesso: number | null; registros_erro: number | null; erro_mensagem: string | null; created_at: string };
const logTone: Record<string, Tone> = { sucesso: 'success', erro: 'danger', parcial: 'warning' };
const logLabel: Record<string, string> = { sucesso: 'Sucesso', erro: 'Erro', parcial: 'Parcial' };

export default function AutomationsScreen() {
  const { session, profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [tab, setTab] = useState<'automacoes' | 'logs'>('automacoes');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [settings, logs, queue] = await Promise.all([
      client.from('automation_settings').select('id, chave, ativo, updated_at').eq('clinica_id', clinicId).order('chave'),
      client.from('automation_logs').select('id, tipo, nome, status, registros_processados, registros_sucesso, registros_erro, erro_mensagem, created_at').eq('clinica_id', clinicId).order('created_at', { ascending: false }).limit(50),
      client.from('notification_queue').select('id', { count: 'exact', head: true }).eq('clinica_id', clinicId).in('status', ['pendente', 'erro', 'incerto']),
    ]);
    if (queue.error) throw new Error(queue.error.message);
    return { settings: (must(settings) ?? []) as Setting[], logs: (must(logs) ?? []) as Log[], queued: queue.count ?? 0 };
  }, [clinicId]);

  const setting = (key: string) => data?.settings.find(s => s.chave === key);
  // No row means the backend treats the automation as on (isAutomationActive uses `?.ativo !== false`).
  const isActive = (a: (typeof AUTOMATIONS)[number]) => a.configurable === false ? true : setting(a.key)?.ativo ?? true;
  const activeCount = AUTOMATIONS.filter(isActive).length;
  const failedLogs = (data?.logs ?? []).filter(l => l.status === 'erro').length;

  async function requestToggle(a: (typeof AUTOMATIONS)[number]) {
    if (!clinicId || !data || busy) return;
    const current = isActive(a);
    const next = !current;
    setBusy(a.key);
    setFeedback(null);
    let pending: number;
    try {
      const { count, error: countError } = await db.from('notification_queue').select('id', { count: 'exact', head: true }).eq('clinica_id', clinicId).in('status', ['pendente', 'enviando', 'incerto', 'erro']);
      if (countError || count === null) throw new Error('A contagem de envios não foi confirmada.');
      pending = count;
    } catch {
      setBusy(null);
      return setFeedback({ message: 'Não foi possível confirmar quantos envios existentes serão preservados. Tente novamente.', error: true });
    }
    setBusy(null);
    const impact = pending === 0 ? 'Não há envios pendentes ou em conferência nesta clínica; a fila existente não será alterada.' : `Há ${pending} envios pendentes ou em conferência nesta clínica; eles não serão alterados por esta mudança.`;
    Alert.alert(next ? 'Confirmar ativação' : 'Confirmar desativação', `A automação "${a.name}" ${next ? 'passará a participar' : 'deixará de participar'} dos próximos processamentos desta clínica.\n\n${impact}`, [
      { text: 'Voltar', style: 'cancel' },
      { text: next ? 'Ativar automação' : 'Desativar automação', style: next ? 'default' : 'destructive', onPress: () => void toggle(a, current, next) },
    ]);
  }

  async function toggle(a: (typeof AUTOMATIONS)[number], current: boolean, next: boolean) {
    if (!clinicId) return;
    setBusy(a.key);
    try {
      const existing = setting(a.key);
      if (existing) {
        // Conditional on the state shown, so a concurrent change is not overwritten.
        const row = must(await db.from('automation_settings').update({ ativo: next }).eq('id', existing.id).eq('clinica_id', clinicId).eq('ativo', current).select('id').maybeSingle());
        if (!row) throw new Error('A configuração mudou desde a prévia. Atualize a tela e confira o estado atual.');
      } else {
        must(await db.from('automation_settings').insert({ chave: a.key, ativo: next, descricao: a.description, valor: {}, clinica_id: clinicId }));
      }
      // Same audit trail as the web (best effort; the change itself already succeeded).
      const { error: auditError } = await db.from('audit_log').insert({ action: 'update', collection: 'automation_settings', record_id: existing?.id ?? a.key, record_name: a.name, changes: [{ field: 'ativo', oldValue: current, newValue: next }], user_id: session?.user.id ?? null, user_name: profile?.nome ?? null });
      setFeedback({ message: `${next ? 'Automação ativada' : 'Automação desativada'}.${auditError ? ' O registro de autoria não foi gravado.' : ''}` });
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao alterar status da automação.'), error: true }); } finally { setBusy(null); reload(); }
  }

  return <ModuleScreen moduleKey="automacoes" subtitle={data ? `${activeCount} automação(ões) ativa(s) · ${data.queued} mensagem(ns) na fila de envio` : 'Lembretes e mensagens automáticas da clínica.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando automações…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as automações" message={error} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Na fila de envio" value={data?.queued ?? 0} onPress={() => router.push('/modules/mensagens-pacientes')} />
        <Stat label="Falhas nos logs" value={failedLogs} tone="warning" onPress={() => setTab('logs')} />
      </View>
      <Segmented options={[{ value: 'automacoes', label: 'Automações' }, { value: 'logs', label: 'Histórico' }]} value={tab} onChange={setTab} />
      {tab === 'automacoes' ? <Section title="Automações">{AUTOMATIONS.map(a => {
        const on = isActive(a);
        const fixed = a.configurable === false;
        const s = setting(a.key);
        return <ListRow key={a.key} title={a.name} subtitle={a.description} meta={fixed ? 'Automática · executada pelo fluxo clínico' : s?.updated_at ? `Atualizado: ${dateLabel(s.updated_at)}` : null}
          right={fixed ? <Badge label="Automática" tone="info" /> : <Switch value={on} disabled={busy !== null} onValueChange={() => void requestToggle(a)} accessibilityLabel={`${on ? 'Desativar' : 'Ativar'} ${a.name}`} trackColor={{ true: colors.primary, false: colors.border }} />} />;
      })}</Section> : !data?.logs.length ? <StateView icon="time-outline" title="Nenhum log de execução encontrado" /> :
        <Section title="Histórico de execuções">{data.logs.map(l => <ListRow key={l.id} title={l.nome} subtitle={l.erro_mensagem} meta={[dateLabel(l.created_at), l.tipo, l.registros_processados !== null ? `${l.registros_sucesso ?? 0} envios / ${l.registros_processados} registros${l.registros_erro ? ` (${l.registros_erro} erros)` : ''}` : null].filter(Boolean).join(' · ')}
          right={<Badge label={logLabel[l.status] ?? l.status} tone={logTone[l.status] ?? 'neutral'} />} />)}</Section>}
    </>}
    <Text style={styles.note}>Execução manual e erros do navegador ficam na versão web.</Text>
    <OpenOnWeb path="/automacoes" />
  </ModuleScreen>;
}

const styles = StyleSheet.create({ stats: { flexDirection: 'row', gap: 10, marginBottom: 14 }, note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginVertical: 14 } });
