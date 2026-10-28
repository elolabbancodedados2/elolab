import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Chips, Feedback, ListRow, Section, Segmented, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Mirrors src/pages/AgenteIA.tsx and src/components/whatsapp/useWhatsApp*.ts.
type Agent = { id: string; nome: string; tipo: string; ativo: boolean };
type Session = { id: string; instance_name: string; status: string; phone_number: string | null; agent_id: string | null; whatsapp_agents?: { nome: string } | null };
type Conv = { id: string; remote_jid: string; status: string; ultima_mensagem_at: string; prioridade: string; nao_lidas: number; primeira_resposta_em: string | null; sla_limite_em: string | null; pacientes?: { nome: string } | null; profiles?: { nome: string } | null };

const convLabel: Record<string, [string, Tone]> = { ativo: ['Ativa', 'success'], aguardando_humano: ['Aguardando humano', 'warning'], em_atendimento_humano: ['Com atendente', 'info'], aguardando_avaliacao: ['Aguardando avaliação', 'info'], encerrado: ['Encerrada', 'neutral'] };
const sessionLabel: Record<string, [string, Tone]> = { connected: ['Conectado', 'success'], qr_code: ['Aguardando QR', 'warning'], connecting: ['Conectando', 'info'] };
const filters = [{ value: 'todos', label: 'Todas' }, { value: 'aguardando_humano', label: 'Aguardando' }, { value: 'em_atendimento_humano', label: 'Com atendente' }, { value: 'ativo', label: 'Com a IA' }, { value: 'encerrado', label: 'Encerradas' }];

export default function AiAgentScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [tab, setTab] = useState<'conversas' | 'sessoes' | 'agentes'>('conversas');
  const [filter, setFilter] = useState('todos');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [agents, sessions, convs] = await Promise.all([
      client.from('whatsapp_agents').select('id, nome, tipo, ativo').eq('clinica_id', clinicId).order('created_at', { ascending: false }),
      client.from('whatsapp_sessions').select('id, instance_name, status, phone_number, agent_id, whatsapp_agents(nome)').eq('clinica_id', clinicId).order('created_at', { ascending: false }),
      client.from('whatsapp_conversations').select('id, remote_jid, status, ultima_mensagem_at, prioridade, nao_lidas, primeira_resposta_em, sla_limite_em, pacientes(nome), profiles!whatsapp_conversations_responsavel_id_fkey(nome)').eq('clinica_id', clinicId).order('ultima_mensagem_at', { ascending: false }).order('id', { ascending: false }).limit(50),
    ]);
    return { agents: (must(agents) ?? []) as Agent[], sessions: (must(sessions) ?? []) as Session[], convs: (must(convs) ?? []) as Conv[] };
  }, [clinicId]);

  // Realtime refresh like the web; channel removed on unmount.
  useEffect(() => {
    if (!db || !clinicId) return;
    const channel = db.channel(`whatsapp-conversations-mobile:${clinicId}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `clinica_id=eq.${clinicId}` }, () => reload())
      .subscribe();
    return () => { void db.removeChannel(channel); };
  }, [clinicId, reload]);

  async function run(id: string, task: () => Promise<void>, success: string) {
    setBusy(id);
    setFeedback(null);
    try { await task(); setFeedback({ message: success }); } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível atualizar a conversa.'), error: true }); } finally { setBusy(null); reload(); }
  }

  const setStatus = (c: Conv, status: 'em_atendimento_humano' | 'ativo') => run(c.id, async () => {
    const { error: rpcError } = status === 'em_atendimento_humano'
      ? await db.rpc('assumir_conversa_whatsapp', { _conversation_id: c.id })
      : await db.rpc('alterar_status_conversa_whatsapp', { _conversation_id: c.id, _status: status });
    if (rpcError) throw new Error(rpcError.message);
  }, status === 'em_atendimento_humano' ? 'Conversa assumida para atendimento.' : 'Conversa devolvida para a IA.');

  function toggleAgent(a: Agent) {
    Alert.alert(a.ativo ? 'Desativar agente' : 'Ativar agente', `${a.ativo ? 'Desativar' : 'Ativar'} o agente "${a.nome}"?`, [
      { text: 'Voltar', style: 'cancel' },
      { text: a.ativo ? 'Desativar' : 'Ativar', style: a.ativo ? 'destructive' : 'default', onPress: () => void run(a.id, async () => {
        const row = must(await db.from('whatsapp_agents').update({ ativo: !a.ativo }).eq('id', a.id).eq('clinica_id', clinicId).select('id').maybeSingle());
        if (!row) throw new Error('Agente não encontrado nesta clínica.');
      }, 'Agente atualizado!') },
    ]);
  }

  const convs = (data?.convs ?? []).filter(c => filter === 'todos' || c.status === filter || (filter === 'encerrado' && c.status === 'aguardando_avaliacao'));
  const connected = (data?.sessions ?? []).filter(s => s.status === 'connected').length;
  const waiting = (data?.convs ?? []).filter(c => c.status === 'aguardando_humano').length;

  return <ModuleScreen moduleKey="agente-ia" subtitle={data ? `${connected} sessão(ões) conectada(s) · ${waiting} conversa(s) aguardando atendimento humano` : 'Atendimento por WhatsApp com IA.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando sessões, agentes e conversas…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o painel de WhatsApp" message={error} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Aguardando atendimento" value={waiting} tone="warning" onPress={() => { setTab('conversas'); setFilter('aguardando_humano'); }} />
        <Stat label="Sessões conectadas" value={connected} onPress={() => setTab('sessoes')} />
      </View>
      <Segmented options={[{ value: 'conversas', label: 'Conversas' }, { value: 'sessoes', label: 'Sessões' }, { value: 'agentes', label: 'Agentes' }]} value={tab} onChange={setTab} />
      {tab === 'conversas' ? <>
        <Chips options={filters} value={filter} onChange={setFilter} />
        {!convs.length ? <StateView icon="chatbubbles-outline" title="Nenhuma conversa" message="Nenhuma conversa neste filtro." /> : <Section title={`${convs.length} conversa(s) recentes`}>{convs.map(c => {
          const phone = c.remote_jid.replace('@s.whatsapp.net', '');
          const [label, tone] = convLabel[c.status] ?? [c.status, 'neutral'];
          const slaLate = c.sla_limite_em && !c.primeira_resposta_em && new Date(c.sla_limite_em) < new Date();
          return <View key={c.id}>
            <ListRow title={c.pacientes?.nome || phone} subtitle={[c.pacientes?.nome ? phone : null, c.profiles?.nome ? `Responsável: ${c.profiles.nome}` : 'Sem responsável', `Prioridade ${c.prioridade}`, slaLate ? 'SLA de resposta vencido' : null].filter(Boolean).join(' · ')}
              meta={`${dateLabel(c.ultima_mensagem_at)}${c.nao_lidas ? ` · ${c.nao_lidas > 99 ? '99+' : c.nao_lidas} não lida(s)` : ''}`} right={<Badge label={label} tone={tone} />} />
            {['aguardando_humano', 'ativo', 'em_atendimento_humano'].includes(c.status) ? <View style={styles.actions}>
              {c.status !== 'em_atendimento_humano' ? <Button variant="secondary" label="Assumir" disabled={busy === c.id} onPress={() => void setStatus(c, 'em_atendimento_humano')} /> : <Button variant="secondary" label="Devolver à IA" disabled={busy === c.id} onPress={() => void setStatus(c, 'ativo')} />}
            </View> : null}
          </View>;
        })}</Section>}
        <Text style={styles.note}>Responder, anexar arquivos, notas internas e encerrar com avaliação ficam na versão web.</Text>
      </> : tab === 'sessoes' ? (!data?.sessions.length ? <StateView icon="phone-portrait-outline" title="Nenhuma sessão de WhatsApp" message="Crie e conecte a sessão pelo QR Code na versão web." /> :
        <Section title="Sessões de WhatsApp">{data.sessions.map(s => {
          const [label, tone] = sessionLabel[s.status] ?? ['Desconectado', 'danger'];
          return <ListRow key={s.id} icon="logo-whatsapp" title={s.instance_name} subtitle={s.phone_number} meta={s.whatsapp_agents?.nome ? `Agente: ${s.whatsapp_agents.nome}` : 'Sem agente vinculado'} right={<Badge label={label} tone={tone} />} />;
        })}</Section>) :
        !data?.agents.length ? <StateView icon="sparkles-outline" title="Nenhum agente configurado" message="Configure agentes na versão web." /> :
          <Section title="Agentes">{data.agents.map(a => <ListRow key={a.id} title={a.nome} subtitle={a.tipo} meta={a.ativo ? 'Ativo' : 'Inativo'}
            right={<Switch value={a.ativo} disabled={busy !== null} onValueChange={() => toggleAgent(a)} accessibilityLabel={`${a.ativo ? 'Desativar' : 'Ativar'} ${a.nome}`} trackColor={{ true: colors.primary, false: colors.border }} />} />)}</Section>}
    </>}
    <OpenOnWeb path="/agente-ia" />
  </ModuleScreen>;
}

const styles = StyleSheet.create({ stats: { flexDirection: 'row', gap: 10, marginBottom: 14 }, actions: { flexDirection: 'row', gap: 8, paddingVertical: 8 }, note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginVertical: 14 } });
