import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Segmented, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError, humanize, money, parseMoney } from '../../lib/format';
import { db, must, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Lote = { id: string; numero_lote: string; competencia: string; status: string; versao_tiss: string | null; quantidade_guias: number; valor_apresentado: number; valor_pago: number | null; valor_conciliado_financeiro: number | null; retorno_em: string | null; convenios: { nome: string } | null };
type Glosa = { id: string; codigo_glosa: string; motivo: string; guia_referencia: string | null; valor_glosado: number; valor_recuperado: number | null; status: string; recurso_justificativa: string | null; recurso_prazo: string | null; lotes_tiss: { numero_lote: string; convenios: { nome: string } | null } | null };
type Retorno = { glosa: Glosa; decisao: 'aceita' | 'mantida'; valor: string };

const LIMIT = 20000;
const LOTE_TONE: Record<string, Tone> = { rascunho: 'neutral', enviado: 'primary', processando: 'info', pago_parcial: 'warning', pago: 'success', rejeitado: 'danger', cancelado: 'neutral' };
const GLOSA_TONE: Record<string, Tone> = { pendente: 'warning', recurso_preparacao: 'info', recurso_enviado: 'primary', aceita: 'success', mantida: 'danger', cancelada: 'neutral' };
const LOTE_FILTERS = [{ value: 'todos', label: 'Todos' }, { value: 'rascunho', label: 'Rascunho' }, { value: 'enviado', label: 'Enviado' }, { value: 'pago_parcial', label: 'Pago parcial' }, { value: 'pago', label: 'Pago' }];
const GLOSA_FILTERS = [{ value: 'todos', label: 'Todas' }, { value: 'pendente', label: 'Pendente' }, { value: 'recurso_preparacao', label: 'Preparando recurso' }, { value: 'recurso_enviado', label: 'Recurso enviado' }, { value: 'aceita', label: 'Aceita' }];
const competencia = (c: string) => dateLabel(c).slice(3);
async function fetchAll<T>(build: () => Db): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < LIMIT) {
    const batch = (must<T[]>(await build().range(rows.length, rows.length + 999)) ?? []);
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

export default function BillingScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [tab, setTab] = useState<'lotes' | 'glosas'>('lotes');
  const [loteStatus, setLoteStatus] = useState('todos');
  const [glosaStatus, setGlosaStatus] = useState('todos');
  const [retorno, setRetorno] = useState<Retorno | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [lotes, glosas] = await Promise.all([
      fetchAll<Lote>(() => client.from('lotes_tiss').select('*,convenios(nome,registro_ans)').eq('clinica_id', clinicId).order('competencia', { ascending: false }).order('id', { ascending: true })),
      fetchAll<Glosa>(() => client.from('glosas_convenio').select('*,lotes_tiss(numero_lote,convenios(nome))').eq('clinica_id', clinicId).order('created_at', { ascending: false }).order('id', { ascending: true })),
    ]);
    return { lotes, glosas };
  }, [clinicId]);

  const lotes = data?.lotes ?? [];
  const glosas = data?.glosas ?? [];
  const ativas = glosas.filter(g => g.status !== 'cancelada');
  const resumo = {
    apresentado: lotes.filter(l => ['enviado', 'processando', 'pago_parcial', 'pago', 'rejeitado'].includes(l.status)).reduce((s, l) => s + Number(l.valor_apresentado || 0), 0),
    pago: lotes.reduce((s, l) => s + Number(l.valor_pago || 0), 0),
    glosado: ativas.reduce((s, g) => s + Number(g.valor_glosado || 0), 0),
    recuperado: ativas.reduce((s, g) => s + Number(g.valor_recuperado || 0), 0),
  };
  const divergentes = lotes.filter(l => Number(l.valor_pago || 0) !== Number(l.valor_conciliado_financeiro || 0)).length;
  const emAberto = glosas.filter(g => ['pendente', 'recurso_preparacao', 'recurso_enviado'].includes(g.status)).length;
  const count = (list: { status: string }[], s: string) => (s === 'todos' ? list.length : list.filter(x => x.status === s).length);
  const lotesView = lotes.filter(l => loteStatus === 'todos' || l.status === loteStatus);
  const glosasView = glosas.filter(g => glosaStatus === 'todos' || g.status === glosaStatus);
  const showGlosas = (status = 'todos') => { setTab('glosas'); setGlosaStatus(status); };

  async function saveRetorno() {
    if (!retorno || busy) return;
    const { glosa, decisao } = retorno;
    if (decisao === 'aceita' && !retorno.valor.trim()) return setFeedback({ message: 'Informe o valor efetivamente recuperado; use zero se nada foi recuperado.', error: true });
    const valor = decisao === 'aceita' ? parseMoney(retorno.valor) : 0;
    if (!Number.isFinite(valor) || valor < 0 || valor > Number(glosa.valor_glosado)) return setFeedback({ message: 'Informe um valor recuperado entre zero e o valor da glosa, com até duas casas decimais.', error: true });
    setBusy(true); setFeedback(null);
    try {
      const res = must<{ success?: boolean }>(await db.rpc('atualizar_glosa_convenio', { p_glosa_id: glosa.id, p_status: decisao, p_recurso_justificativa: null, p_valor_recuperado: valor }));
      if (!res?.success) throw new Error('A glosa já mudou de status (recurso_enviado). Atualize a lista antes de continuar.');
      setRetorno(null);
      setFeedback({ message: decisao === 'aceita' ? 'Glosa aceita; valor recuperado registrado.' : 'Decisão da operadora registrada.' });
    } catch (err) { setFeedback({ message: `Não foi possível atualizar a glosa. ${friendlyError(err)}`, error: true }); } finally { setBusy(false); reload(); }
  }

  return <ModuleScreen moduleKey="faturamento-convenios" title="Faturamento de convênios" subtitle={lotes.length + glosas.length ? `${lotes.length} lote(s) · ${count(lotes, 'rascunho')} em rascunho · ${emAberto} glosa(s) em aberto` : 'Lotes TISS, retorno das operadoras, glosas e recursos.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando faturamento de convênios…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o faturamento" message={error} onAction={reload} /> : <>
      {divergentes ? <Text accessibilityRole="alert" style={styles.warn}>{divergentes} lote(s) têm diferença entre o total recebido e o conciliado no financeiro. Confira lançamentos existentes antes de conciliar, para evitar duplicidade.</Text> : null}
      {lotes.length >= LIMIT || glosas.length >= LIMIT ? <Text accessibilityRole="alert" style={styles.warn}>A lista atingiu o limite de {LIMIT.toLocaleString('pt-BR')} registros. Os indicadores podem não incluir todos os lotes ou glosas.</Text> : null}
      <View style={styles.stats}>
        <Stat label="Apresentado · lotes enviados" value={money(resumo.apresentado)} onPress={() => { setTab('lotes'); setLoteStatus('enviado'); }} />
        <Stat label="Pago · recebido das operadoras" value={money(resumo.pago)} tone="success" onPress={() => { setTab('lotes'); setLoteStatus('pago'); }} />
        <Stat label="Glosado · não canceladas" value={money(resumo.glosado)} tone="danger" onPress={() => showGlosas()} />
        <Stat label="Recuperado em recurso" value={money(resumo.recuperado)} tone="info" onPress={() => showGlosas('aceita')} />
      </View>
      <View style={styles.gap} />
      <Segmented options={[{ value: 'lotes', label: `Lotes (${lotes.length})` }, { value: 'glosas', label: `Glosas (${glosas.length})` }]} value={tab} onChange={setTab} />
      {retorno ? <Card style={styles.form}>
        <Text style={styles.formTitle}>Registrar retorno da operadora</Text>
        <Text style={styles.caption}>Glosa {retorno.glosa.codigo_glosa} · {money(retorno.glosa.valor_glosado)}</Text>
        <Chips label="Decisão da operadora" options={[{ value: 'aceita', label: 'Recurso aceito' }, { value: 'mantida', label: 'Glosa mantida' }]} value={retorno.decisao} onChange={d => setRetorno({ ...retorno, decisao: d as Retorno['decisao'] })} />
        {retorno.decisao === 'aceita' ? <Field label="Valor recuperado (R$)" value={retorno.valor} onChangeText={valor => setRetorno({ ...retorno, valor })} keyboardType="decimal-pad" hint="Use zero se nada foi recuperado." /> : <Text style={styles.caption}>Glosa mantida registra valor recuperado zero.</Text>}
        <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={busy} onPress={() => setRetorno(null)} /><Button icon="checkmark" label="Salvar retorno" loading={busy} onPress={() => void saveRetorno()} /></View>
      </Card> : null}
      {tab === 'lotes' ? <>
        <Chips options={LOTE_FILTERS.map(f => ({ ...f, label: `${f.label} ${count(lotes, f.value)}` }))} value={loteStatus} onChange={setLoteStatus} />
        {!lotesView.length ? <StateView icon="documents-outline" title={lotes.length ? 'Nenhum lote corresponde ao filtro' : 'Nenhum lote cadastrado'} message={lotes.length ? undefined : 'Crie lotes no navegador depois de fechar as guias da competência.'} /> :
          <Section title={`${lotesView.length} lote(s)`}>{lotesView.map(l => <ListRow key={l.id} icon="documents-outline" tone={LOTE_TONE[l.status] ?? 'neutral'} title={`Lote ${l.numero_lote} · ${l.convenios?.nome ?? 'Convênio sem nome'}`}
            subtitle={`Competência ${competencia(l.competencia)} · TISS ${l.versao_tiss ?? '—'} · ${l.quantidade_guias} guias`}
            meta={`Apresentado ${money(l.valor_apresentado)} · Recebido ${money(l.valor_pago)} · No financeiro ${money(l.valor_conciliado_financeiro || 0)}`}
            right={<Badge label={humanize(l.status)} tone={LOTE_TONE[l.status] ?? 'neutral'} />} />)}</Section>}
      </> : <>
        <Chips options={GLOSA_FILTERS.map(f => ({ ...f, label: `${f.label} ${count(glosas, f.value)}` }))} value={glosaStatus} onChange={setGlosaStatus} />
        {!glosasView.length ? <StateView icon="shield-checkmark-outline" title={glosas.length ? 'Nenhuma glosa corresponde ao filtro' : 'Nenhuma glosa registrada nesta clínica.'} /> :
          <Section title={`${glosasView.length} glosa(s)`}>{glosasView.map(g => <View key={g.id} style={styles.item}>
            <ListRow icon="alert-circle-outline" tone={GLOSA_TONE[g.status] ?? 'neutral'} title={`${g.codigo_glosa} · ${money(g.valor_glosado)}`} subtitle={g.motivo}
              meta={[g.lotes_tiss ? `Lote ${g.lotes_tiss.numero_lote} · ${g.lotes_tiss.convenios?.nome ?? ''}` : null, g.guia_referencia ? `Guia ${g.guia_referencia}` : null, g.recurso_prazo ? `Prazo ${dateLabel(g.recurso_prazo)}` : null, Number(g.valor_recuperado || 0) ? `Recuperado ${money(g.valor_recuperado)}` : null].filter(Boolean).join(' · ')}
              right={<Badge label={humanize(g.status)} tone={GLOSA_TONE[g.status] ?? 'neutral'} />} />
            {g.status === 'recurso_enviado' ? <View style={styles.actions}><Button label="Registrar retorno" disabled={busy} onPress={() => { setFeedback(null); setRetorno({ glosa: g, decisao: 'aceita', valor: String(g.valor_glosado).replace('.', ',') }); }} /></View> : null}
          </View>)}</Section>}
      </>}
      <Section title="No navegador">
        <Text style={styles.note}>Criação de lotes, conferência de guias, registro de envio e de retorno do lote (que pode gerar lançamento financeiro), registro de glosa, preparação de recurso com documentos, conciliação por lote, relatório por competência e o resumo XML ficam no navegador. O XML é um resumo operacional e o EloLab não o transmite à operadora.</Text>
        <OpenOnWeb path="/faturamento-convenios" />
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, gap: { height: 14 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 10 },
  form: { marginBottom: 12 }, formTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, caption: { color: colors.muted, fontSize: 12, marginVertical: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingVertical: 6 }, item: { marginBottom: 4 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
});
