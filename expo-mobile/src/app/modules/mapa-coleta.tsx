import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError, humanize } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Mirrors src/pages/MapaColeta.tsx, src/lib/mapaColetaWorkflow.ts and src/lib/sampleRejection.ts.
type Item = { id: string; codigo_amostra: string | null; status: string; created_at: string | null; updated_at: string | null; tipo_amostra: string | null; local_atual: string | null; rejeicao_motivo: string | null; tubo: string | null; urgente: boolean | null; jejum_necessario: boolean | null; jejum_horas: number | null; setor_id: string | null; data_coleta: string | null; pacientes: { nome: string | null; nome_social: string | null; cpf: string | null } | null; medicos: { nome: string | null } | null; exames: { tipo_exame: string | null } | null; laboratorio_setores: { nome: string | null } | null };
type Evento = { id: string; tipo: string; status_novo: string | null; local: string | null; detalhes: { motivo?: string } | null; created_at: string; profiles: { nome: string | null } | null };
type Filtro = 'todos' | 'pendente' | 'recoleta' | 'coletados' | 'urgente' | 'sla' | 'rejeitada';

const SLA_CRITICAL = 60;
const REASONS = [
  { value: 'identificacao_divergente', label: 'Identificação divergente' }, { value: 'recipiente_inadequado', label: 'Tubo ou recipiente inadequado' },
  { value: 'volume_insuficiente', label: 'Volume insuficiente' }, { value: 'hemolisada', label: 'Amostra hemolisada' }, { value: 'coagulada', label: 'Amostra coagulada' },
  { value: 'conservacao_inadequada', label: 'Conservação inadequada' }, { value: 'contaminada', label: 'Amostra contaminada' },
  { value: 'prazo_excedido', label: 'Prazo de estabilidade excedido' }, { value: 'outro', label: 'Outro' },
];
const statusLabel: Record<string, string> = { pendente: 'Pendente', coletado: 'Coletado', em_analise: 'Em análise', recoleta: 'Recoleta', rejeitada: 'Rejeitada' };
const statusTone: Record<string, Tone> = { pendente: 'warning', recoleta: 'warning', coletado: 'primary', em_analise: 'info', rejeitada: 'danger' };
const ORDEM: Record<string, number> = { recoleta: 0, pendente: 1, coletado: 2, em_analise: 3, rejeitada: 4 };
const aguarda = (i: Item) => i.status === 'pendente' || i.status === 'recoleta';
const slaFrom = (i: Item) => i.status === 'recoleta' ? i.updated_at || i.created_at : i.status === 'pendente' ? i.created_at : null;
const minutes = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
const wait = (iso: string) => { const m = minutes(iso); return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ''}`; };
const critical = (i: Item) => { const d = aguarda(i) ? slaFrom(i) : null; return !!d && minutes(d) > SLA_CRITICAL; };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nome = (i: Item) => i.pacientes?.nome_social?.trim() || i.pacientes?.nome || '—';
const byPriority = (a: Item, b: Item) => (ORDEM[a.status] ?? 9) - (ORDEM[b.status] ?? 9) || (!!a.urgente === !!b.urgente ? 0 : a.urgente ? -1 : 1) || String(slaFrom(a) ?? a.created_at ?? '').localeCompare(String(slaFrom(b) ?? b.created_at ?? ''));
const emptyEvent = { tipo: 'transporte', local: '', motivoCodigo: '', motivo: '' };

export default function MapaColetaScreen() {
  const { session, profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [evento, setEvento] = useState(emptyEvent);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    // Same keyset pagination as the web so no open sample is silently cut off.
    const all: Item[] = [];
    let cursor: Item | null = null;
    for (;;) {
      let query = client.from('coletas_laboratorio').select('id, codigo_amostra, status, created_at, updated_at, tipo_amostra, local_atual, rejeicao_motivo, tubo, urgente, jejum_necessario, jejum_horas, setor_id, data_coleta, pacientes(nome, nome_social, cpf), medicos(nome), exames(tipo_exame), laboratorio_setores(nome)')
        .in('status', ['pendente', 'coletado', 'em_analise', 'recoleta', 'rejeitada']).eq('clinica_id', clinicId);
      if (cursor) query = query.or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`);
      const batch = must<Item[]>(await query.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(500)) ?? [];
      all.push(...batch);
      if (batch.length < 500) break;
      cursor = batch[batch.length - 1];
    }
    return all;
  }, [clinicId]);

  const events = useLoad(async client => {
    if (!clinicId || !detailId) return undefined;
    return must<Evento[]>(await client.from('laboratorio_eventos_amostra').select('id, tipo, status_anterior, status_novo, local, detalhes, created_at, profiles(nome)').eq('clinica_id', clinicId).eq('coleta_id', detailId).order('created_at', { ascending: false }).limit(100)) ?? [];
  }, [clinicId, detailId]);

  const itens = data ?? [];
  const stats = { pendente: itens.filter(i => i.status === 'pendente').length, recoleta: itens.filter(i => i.status === 'recoleta').length, coletados: itens.filter(i => i.status === 'coletado' || i.status === 'em_analise').length, urgente: itens.filter(i => i.urgente && aguarda(i)).length, sla: itens.filter(critical).length, rejeitada: itens.filter(i => i.status === 'rejeitada').length };
  const proxima = itens.filter(aguarda).sort((a, b) => (!!a.urgente === !!b.urgente ? 0 : a.urgente ? -1 : 1) || String(slaFrom(a) ?? '').localeCompare(String(slaFrom(b) ?? '')))[0];
  const q = norm(search.trim());
  const filtrado = itens.filter(i => {
    if (filtro === 'pendente' && i.status !== 'pendente') return false;
    if (filtro === 'recoleta' && i.status !== 'recoleta') return false;
    if (filtro === 'coletados' && i.status !== 'coletado' && i.status !== 'em_analise') return false;
    if (filtro === 'rejeitada' && i.status !== 'rejeitada') return false;
    if (filtro === 'urgente' && !(i.urgente && aguarda(i))) return false;
    if (filtro === 'sla' && !critical(i)) return false;
    if (q && ![nome(i), i.pacientes?.nome ?? '', i.codigo_amostra ?? '', i.exames?.tipo_exame ?? ''].some(v => norm(v).includes(q)) && !(q.replace(/\D/g, '') && (i.pacientes?.cpf ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '')))) return false;
    return true;
  }).sort(byPriority);
  const detail = itens.find(i => i.id === detailId);

  async function transition(i: Item, expected: string[], status: string, message: string) {
    if (!clinicId || busy) return;
    setBusy(i.id); setFeedback(null);
    try {
      const updates: Record<string, unknown> = status === 'coletado' ? { status, data_coleta: new Date().toISOString(), ...(session?.user.id ? { coletado_por: session.user.id } : {}) } : { status };
      const row = must(await db.from('coletas_laboratorio').update(updates).eq('id', i.id).eq('clinica_id', clinicId).in('status', expected).select('id').maybeSingle());
      if (!row) throw new Error('O status da coleta mudou ou ela não pertence à clínica atual. Atualize o mapa e tente novamente.');
      setFeedback({ message });
    } catch (err) { setFeedback({ message: `Não foi possível atualizar a coleta. ${friendlyError(err)}`, error: true }); }
    finally { setBusy(null); reload(); }
  }

  const cancel = (i: Item) => Alert.alert('Cancelar coleta?', 'Esta coleta será marcada como cancelada.', [
    { text: 'Voltar', style: 'cancel' },
    { text: 'Cancelar coleta', style: 'destructive', onPress: () => void transition(i, ['pendente', 'recoleta'], 'cancelado', 'Coleta cancelada') },
  ]);

  async function registerEvent() {
    if (!detail || busy) return;
    const motivo = evento.motivo.trim();
    if (['transporte', 'armazenamento'].includes(evento.tipo) && !evento.local.trim()) return setFeedback({ message: 'Informe o local da amostra.', error: true });
    let detalhes: Record<string, unknown> = motivo ? { motivo } : {};
    if (['rejeicao', 'recoleta'].includes(evento.tipo)) {
      const reason = REASONS.find(r => r.value === evento.motivoCodigo);
      if (!reason || motivo.length > 300 || (reason.value === 'outro' && motivo.length < 5)) return setFeedback({ message: evento.motivoCodigo === 'outro' ? 'Explique o motivo selecionado em pelo menos 5 caracteres.' : 'Selecione um motivo para continuar.', error: true });
      detalhes = { motivo_codigo: reason.value, motivo_rotulo: reason.label, motivo_detalhe: motivo || null, motivo: motivo ? `${reason.label} — ${motivo}` : reason.label };
    }
    setBusy('event'); setFeedback(null);
    try {
      const result = must(await db.rpc('laboratorio_registrar_evento_amostra', { p_coleta_id: detail.id, p_tipo: evento.tipo, p_local: evento.local.trim() || null, p_detalhes: detalhes }));
      setFeedback({ message: evento.tipo === 'recoleta' ? 'Nova amostra criada e vinculada à anterior' : 'Movimentação registrada no histórico' });
      if (evento.tipo === 'recoleta' && typeof result === 'string') setDetailId(result);
      setEvento(emptyEvent);
      reload(); events.reload();
    } catch (err) { setFeedback({ message: `Não foi possível registrar a movimentação. ${friendlyError(err)}`, error: true }); } finally { setBusy(null); }
  }

  const eventOptions = detail ? [{ value: 'recebida', label: 'Recebimento no laboratório' }, { value: 'transporte', label: 'Transporte' }, { value: 'armazenamento', label: 'Armazenamento' }, { value: 'observacao', label: 'Observação' },
    ...(['coletado', 'em_analise'].includes(detail.status) ? [{ value: 'rejeicao', label: 'Rejeitar amostra' }] : []),
    ...(['coletado', 'em_analise', 'rejeitada'].includes(detail.status) ? [{ value: 'recoleta', label: 'Solicitar recoleta' }] : [])] : [];

  return <ModuleScreen moduleKey="mapa-coleta" title="Mapa de coleta" refreshing={refreshing} onRefresh={refresh}
    subtitle={stats.pendente + stats.recoleta ? `${stats.pendente + stats.recoleta} amostra(s) aguardando coleta${stats.sla ? ` · ${stats.sla} com SLA crítico` : ''}` : 'Organize a coleta por setor, tubo e prioridade.'}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando mapa de coleta…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o mapa" message={error} onAction={reload} /> : <>
      <View style={styles.stats}>
        {([['pendente', 'Pendentes', 'warning'], ['recoleta', 'Recoletas', 'warning'], ['coletados', 'Coletadas', 'primary'], ['urgente', 'Urgentes', 'danger'], ['sla', 'SLA crítico', 'danger'], ['rejeitada', 'Rejeitadas', 'danger']] as const).map(([key, label, tone]) =>
          <Stat key={key} label={label} value={stats[key]} tone={filtro === key ? 'info' : tone} onPress={() => setFiltro(filtro === key ? 'todos' : key)} />)}
      </View>
      {proxima ? <Card style={styles.hero}>
        <Text style={styles.kicker}>{proxima.urgente ? 'Urgente — Próxima a coletar' : 'Próxima coleta'}</Text>
        <Text style={styles.heroName}>{nome(proxima)}</Text>
        <Text style={styles.muted}>{[proxima.codigo_amostra, proxima.tubo, proxima.exames?.tipo_exame, slaFrom(proxima) ? `Aguardando ${wait(slaFrom(proxima)!)}` : null].filter(Boolean).join(' · ')}</Text>
        <View style={styles.actions}>
          <Button label="Coletar" icon="checkmark-circle-outline" loading={busy === proxima.id} disabled={!!busy} onPress={() => void transition(proxima, ['pendente', 'recoleta'], 'coletado', 'Coleta registrada!')} />
          <Button variant="secondary" label="Detalhes" onPress={() => { setDetailId(proxima.id); setEvento(emptyEvent); }} />
        </View>
      </Card> : null}

      <Section title={filtro === 'todos' ? 'Todas as coletas' : `Filtro: ${filtro === 'sla' ? 'SLA crítico' : humanize(filtro)}`} action={filtro !== 'todos' || search ? <Button variant="ghost" label="Limpar filtros" onPress={() => { setFiltro('todos'); setSearch(''); }} /> : undefined}>
        <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Paciente, CPF, código ou exame" autoCapitalize="none" />
        {!filtrado.length ? <StateView icon="flask-outline" title="Nenhuma coleta encontrada" message={itens.length ? 'Ajuste os filtros ou a busca.' : 'Não há amostras pendentes, coletadas ou em análise.'} /> : filtrado.map(i => {
          const since = slaFrom(i);
          return <View key={i.id} style={styles.item}>
            <ListRow title={nome(i)} subtitle={[i.codigo_amostra, i.laboratorio_setores?.nome ?? (i.setor_id ? 'Setor sem nome' : 'Sem setor definido'), i.exames?.tipo_exame, i.tubo, i.jejum_necessario ? `Jejum ${i.jejum_horas ?? 0}h` : null].filter(Boolean).join(' · ')}
              meta={[i.urgente ? 'Urgente' : null, since ? `Aguardando ${wait(since)}${critical(i) ? ' (SLA crítico)' : ''}` : i.data_coleta ? `Coletada ${dateLabel(i.data_coleta)}` : null, i.local_atual ? `Local: ${i.local_atual}` : null].filter(Boolean).join(' · ')}
              right={<Badge label={statusLabel[i.status] ?? i.status} tone={statusTone[i.status] ?? 'neutral'} />} />
            <View style={styles.actions}>
              {aguarda(i) ? <Button label="Coletar" loading={busy === i.id} disabled={!!busy} onPress={() => void transition(i, ['pendente', 'recoleta'], 'coletado', 'Coleta registrada!')} /> : null}
              {i.status === 'coletado' ? <Button label="Análise" icon="arrow-forward" loading={busy === i.id} disabled={!!busy} onPress={() => void transition(i, ['coletado'], 'em_analise', 'Enviado para análise')} /> : null}
              {i.status === 'coletado' ? <Button variant="secondary" label="Recoleta" disabled={!!busy} onPress={() => { setDetailId(i.id); setEvento({ ...emptyEvent, tipo: 'recoleta' }); }} /> : null}
              <Button variant="ghost" label={detailId === i.id ? 'Fechar' : 'Detalhes'} onPress={() => { setDetailId(detailId === i.id ? null : i.id); setEvento(emptyEvent); }} />
              {aguarda(i) ? <Button variant="danger" label="Cancelar" disabled={!!busy} onPress={() => cancel(i)} /> : null}
            </View>
            {detailId === i.id && detail ? <Card>
              {detail.rejeicao_motivo ? <Text style={styles.danger}>Motivo da rejeição: {detail.rejeicao_motivo}</Text> : null}
              <Text style={styles.label}>Rastreabilidade da amostra</Text>
              <Text style={styles.muted}>Cada movimentação fica registrada com data e responsável.</Text>
              {events.loading ? <StateView loading title="Carregando histórico…" /> : events.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o histórico" message={events.error} onAction={events.reload} /> : !events.data?.length ? <Text style={styles.muted}>Nenhuma movimentação registrada.</Text> :
                events.data.map(e => <ListRow key={e.id} title={`${humanize(e.tipo)}${e.status_novo ? ` · ${e.status_novo}` : ''}`} subtitle={e.detalhes?.motivo ?? null} meta={[dateLabel(e.created_at), e.profiles?.nome, e.local].filter(Boolean).join(' · ')} />)}
              <View style={styles.form}>
                <Chips label="Registrar movimentação" options={eventOptions} value={evento.tipo} onChange={tipo => setEvento({ ...emptyEvent, tipo })} />
                {['rejeicao', 'recoleta'].includes(evento.tipo) ? <>
                  <Chips label="Motivo" options={REASONS} value={evento.motivoCodigo || null} onChange={motivoCodigo => setEvento({ ...evento, motivoCodigo, motivo: '' })} />
                  <Field label={evento.motivoCodigo === 'outro' ? 'Explique o motivo' : 'Detalhe adicional (opcional)'} value={evento.motivo} onChangeText={motivo => setEvento({ ...evento, motivo })} maxLength={300} placeholder={evento.motivoCodigo === 'outro' ? 'Mínimo de 5 caracteres' : 'Até 300 caracteres'} />
                </> : null}
                {['transporte', 'armazenamento'].includes(evento.tipo) ? <Field label="Local" value={evento.local} onChangeText={local => setEvento({ ...evento, local })} maxLength={120} placeholder="Ex.: setor de bioquímica" /> : null}
                {evento.tipo === 'observacao' ? <Field label="Observação" value={evento.motivo} onChangeText={motivo => setEvento({ ...evento, motivo })} maxLength={500} placeholder="Descreva a ocorrência" /> : null}
                <Button label="Registrar evento" loading={busy === 'event'} disabled={!!busy} onPress={() => void registerEvent()} />
              </View>
            </Card> : null}
          </View>;
        })}
      </Section>
    </>}
    <Section title="No navegador">
      <Text style={styles.muted}>Impressão de etiquetas, coleta em lote e o mapa por sala e tubo ficam no computador.</Text>
      <View style={styles.actions}><OpenOnWeb path="/mapa-coleta" label="Abrir mapa no navegador" /></View>
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }, hero: { marginTop: 12, borderColor: colors.primary },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }, heroName: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 4 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 6 },
  danger: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 8, borderRadius: 10, fontSize: 12, marginBottom: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 }, item: { marginBottom: 6 }, form: { marginTop: 14 },
});
