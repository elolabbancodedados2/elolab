import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Card, Chips, Section, Stat, StateView } from '../../components/ui';
import { clinicDate, dateLabel, money } from '../../lib/format';
import { must, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Lanc = { id: string; tipo: string; valor: number; valor_pago: number | null; data: string; data_pagamento: string | null; status: string; agendamento_id: string | null };
type Conta = { agendamento_id: string | null; tipo: string };
type Pag = { id: string; lancamento_id: string; valor: number; data_pagamento: string | null; estornado_em: string | null; lancamentos: Conta | Conta[] | null };
type Ag = { id: string; data: string; status: string; medico_id: string; medicos: { nome: string | null; especialidade: string | null } | null };
type Ev = { tipo: string; agendamentoId: string | null; data: string; valor: number };

const LIMIT = 20000;
const FINAL = new Set(['finalizado', 'atendimento_finalizado']);
const PRESETS = [{ value: '7d', label: 'Últimos 7 dias' }, { value: '30d', label: 'Últimos 30 dias' }, { value: '90d', label: 'Últimos 90 dias' }, { value: 'month', label: 'Mês atual' }, { value: 'prev_month', label: 'Mês anterior' }];
const STATUS = [['Finalizados', ['finalizado', 'atendimento_finalizado']], ['Confirmados', ['confirmado']], ['Agendados', ['agendado']], ['Aguardando pagamento', ['aguardando_pagamento']], ['Pago', ['pago']], ['Aguardando triagem', ['aguardando_triagem']], ['Em triagem', ['em_triagem']], ['Em atendimento', ['em_atendimento']], ['Aguardando', ['aguardando']], ['Aguardando pagamento adicional', ['aguardando_pagamento_adicional']], ['Cancelados', ['cancelado']], ['Faltou', ['faltou']]] as const;
const RISCO = [{ key: 'verde', label: 'Verde', color: colors.success }, { key: 'amarelo', label: 'Amarelo', color: colors.warning }, { key: 'laranja', label: 'Laranja', color: colors.warning }, { key: 'vermelho', label: 'Vermelho', color: colors.danger }];
const realized = (l: Lanc) => (l.valor_pago !== null && l.valor_pago !== undefined && Number.isFinite(Number(l.valor_pago)) ? Number(l.valor_pago) : Number(l.valor) || 0);
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// shortcut: São Paulo has had a fixed UTC-3 offset since 2019; use Intl offset math if older history is ever loaded here.
const startIso = (day: string) => new Date(`${day}T00:00:00-03:00`).toISOString();
function spDay(value: string) {
  if (!value.includes('T') && !value.includes(' ')) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const p = (t: string) => parts.find(x => x.type === t)?.value ?? '';
  return `${p('year')}-${p('month')}-${p('day')}`;
}
/** getDateRange from src/pages/Analytics.tsx, in the clinic's calendar. */
function range(preset: string) {
  const today = clinicDate();
  const m = today.slice(0, 7);
  if (preset === '7d') return { start: addDay(today, -6), end: today };
  if (preset === '90d') return { start: addDay(today, -89), end: today };
  if (preset === 'month') return { start: `${m}-01`, end: today };
  if (preset === 'prev_month') return { start: `${shiftMonth(m, -1)}-01`, end: addDay(`${m}-01`, -1) };
  return { start: addDay(today, -29), end: today };
}
async function fetchAll<T>(build: () => Db): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < LIMIT) {
    const batch = (must<T[]>(await build().range(rows.length, rows.length + 999)) ?? []);
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

function Bar({ label, value, max, text, color = colors.primary }: { label: string; value: number; max: number; text: string; color?: string }) {
  const width = max > 0 && value > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return <View accessible accessibilityLabel={`${label}: ${text}`} style={styles.bar}>
    <View style={styles.barHead}><Text numberOfLines={1} style={styles.barLabel}>{label}</Text><Text style={styles.barValue}>{text}</Text></View>
    <View style={styles.track}><View style={[styles.fill, { width: `${width}%`, backgroundColor: color }]} /></View>
  </View>;
}

export default function ClinicIndicatorsScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [preset, setPreset] = useState('30d');
  const { start, end } = range(preset);
  const days = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1;
  const period = `${dateLabel(start)} a ${dateLabel(end)} (horário de São Paulo)`;

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const from = startIso(start); const to = startIso(addDay(end, 1));
    const lanc = (col: string) => fetchAll<Lanc>(() => client.from('lancamentos').select('id, tipo, valor, valor_pago, data, data_pagamento, status, agendamento_id').eq('clinica_id', clinicId).gte(col, start).lte(col, end).order(col).order('id'));
    const pags = () => client.from('pagamentos').select('id,lancamento_id,valor,data_pagamento,estornado_em,lancamentos!inner(agendamento_id,tipo,clinica_id)').eq('clinica_id', clinicId).eq('lancamentos.clinica_id', clinicId).order('id');
    const [ags, emitidos, pagos, paid, reversed, triagens, feedbacks] = await Promise.all([
      fetchAll<Ag>(() => client.from('agendamentos').select('id, data, status, medico_id, medicos(nome, especialidade)').eq('clinica_id', clinicId).gte('data', start).lte('data', end).order('data').order('id')),
      lanc('data'), lanc('data_pagamento'),
      fetchAll<Pag>(() => pags().gte('data_pagamento', from).lt('data_pagamento', to)),
      fetchAll<Pag>(() => pags().not('estornado_em', 'is', null).gte('estornado_em', from).lt('estornado_em', to)),
      fetchAll<{ id: string; classificacao_risco: string | null }>(() => client.from('triagens').select('id, classificacao_risco').eq('clinica_id', clinicId).gte('created_at', from).lt('created_at', to).order('created_at').order('id')),
      fetchAll<{ id: string; nota: number }>(() => client.from('feedbacks_nps').select('id, nota').eq('clinica_id', clinicId).gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }).order('id')),
    ]);
    const lancs = [...new Map([...emitidos, ...pagos].map(l => [l.id, l])).values()];
    const pagamentos = [...new Map([...paid, ...reversed].map(p => [p.id, p])).values()];
    return { ags, lancs, pagamentos, triagens, feedbacks, capped: [ags.length, lancs.length, pagamentos.length, triagens.length, feedbacks.length].some(n => n >= LIMIT) };
  }, [clinicId, start, end]);

  // eventosFinanceirosDoPeriodo + KPI math from src/pages/Analytics.tsx.
  const view = useMemo(() => {
    if (!data) return null;
    const withPayments = new Set(data.pagamentos.map(p => p.lancamento_id));
    const events: Ev[] = data.lancs.filter(l => ['pago', 'parcial'].includes(l.status) && !withPayments.has(l.id))
      .map(l => ({ tipo: l.tipo, agendamentoId: l.agendamento_id, data: spDay(l.data_pagamento || l.data), valor: realized(l) })).filter(e => e.data >= start && e.data <= end);
    for (const p of data.pagamentos) {
      const conta = Array.isArray(p.lancamentos) ? p.lancamentos[0] : p.lancamentos;
      if (!conta || !['receita', 'despesa'].includes(conta.tipo) || !p.data_pagamento) continue;
      const d = spDay(p.data_pagamento);
      if (d >= start && d <= end) events.push({ tipo: conta.tipo, agendamentoId: conta.agendamento_id, data: d, valor: Number(p.valor) });
      if (p.estornado_em) { const r = spDay(p.estornado_em); if (r >= start && r <= end) events.push({ tipo: conta.tipo, agendamentoId: conta.agendamento_id, data: r, valor: -Number(p.valor) }); }
    }
    const receita = events.filter(e => e.tipo === 'receita').reduce((a, e) => a + e.valor, 0);
    const despesa = events.filter(e => e.tipo === 'despesa').reduce((a, e) => a + e.valor, 0);
    const atend = events.filter(e => e.tipo === 'receita' && e.agendamentoId);
    const comRecebimento = new Set(atend.map(e => e.agendamentoId)).size;
    const ags = data.ags;
    const attended = ags.filter(a => FINAL.has(a.status)).length;
    const missed = ags.filter(a => a.status === 'faltou').length;
    const cancelados = ags.filter(a => a.status === 'cancelado').length;
    const prod: Record<string, { nome: string; esp: string; total: number; fin: number }> = {};
    for (const a of ags) { prod[a.medico_id] ??= { nome: a.medicos?.nome || 'Desconhecido', esp: a.medicos?.especialidade || 'Geral', total: 0, fin: 0 }; prod[a.medico_id].total++; if (FINAL.has(a.status)) prod[a.medico_id].fin++; }
    return {
      receita, despesa, lucro: receita - despesa, margem: receita > 0 ? Math.round(((receita - despesa) / receita) * 100) : null, ticket: comRecebimento ? atend.reduce((a, e) => a + e.valor, 0) / comRecebimento : 0, comRecebimento,
      total: ags.length, attended, missed, cancelados, taxa: attended + missed > 0 ? Math.round((attended / (attended + missed)) * 100) : null, cancelPct: ags.length ? Math.round((cancelados / ags.length) * 100) : 0,
      status: STATUS.map(([name, list]) => ({ name, value: ags.filter(a => (list as readonly string[]).includes(a.status)).length })).filter(s => s.value > 0),
      prod: Object.values(prod).sort((a, b) => b.total - a.total),
      risco: RISCO.map(r => ({ ...r, value: data.triagens.filter(t => t.classificacao_risco === r.key).length })).filter(r => r.value > 0),
      triagens: data.triagens.length, nps: data.feedbacks.length ? data.feedbacks.reduce((a, f) => a + f.nota, 0) / data.feedbacks.length : null, feedbacks: data.feedbacks.length,
      empty: !ags.length && !data.lancs.length && !data.triagens.length && !data.feedbacks.length,
    };
  }, [data, start, end]);

  const explain = (title: string, definition: string, source: string) => Alert.alert(title, `${definition}\n\nFonte: ${source}\nPeríodo: ${period}`);
  const maxStatus = Math.max(0, ...(view?.status ?? []).map(s => s.value));
  const maxProd = Math.max(0, ...(view?.prod ?? []).map(p => p.total));
  const maxRisco = Math.max(0, ...(view?.risco ?? []).map(r => r.value));

  return <ModuleScreen moduleKey="analytics" title="Indicadores da clínica" subtitle={`${dateLabel(start)} a ${dateLabel(end)} · para relatórios detalhados e exportações, acesse Relatórios.`} refreshing={refreshing} onRefresh={refresh}>
    <Chips label="Período" options={PRESETS} value={preset} onChange={setPreset} />
    {loading ? <StateView loading title="Carregando indicadores…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os indicadores" message={error} onAction={reload} /> : !view ? <StateView icon="business-outline" title="Clínica não identificada" message="Peça ao administrador para revisar seu acesso." />
      : view.empty ? <StateView icon="pulse-outline" title="Ainda não há dados neste período" message={`Não encontramos agendamentos, lançamentos, triagens ou feedbacks entre ${dateLabel(start)} e ${dateLabel(end)}. Selecione outro período acima.`} /> : <>
      {data?.capped ? <Text accessibilityRole="alert" style={styles.warn}>O limite de {LIMIT.toLocaleString('pt-BR')} registros foi atingido. Estes indicadores podem estar incompletos.</Text> : null}
      <View style={styles.stats}>
        <Stat label={view.taxa === null ? 'Comparecimento · sem desfecho no período' : `Comparecimento · ${view.attended} de ${view.attended + view.missed} (${view.missed} faltas)`} value={view.taxa === null ? '—' : `${view.taxa}%`} onPress={() => explain('Taxa de comparecimento', 'Consultas finalizadas divididas pelo total de consultas finalizadas e faltas. Consultas futuras, em andamento e canceladas ficam fora do denominador.', 'Agendamentos, pelos estados finalizado, atendimento_finalizado e faltou.')} />
        <Stat label={`Receita do período · margem ${view.margem === null ? '—' : `${view.margem}%`}`} value={money(view.receita)} tone="success" onPress={() => router.push('/modules/financeiro' as Href)} />
        <Stat label={`Ticket médio · lucro ${money(view.lucro)}`} value={view.comRecebimento ? money(view.ticket) : '—'} onPress={() => explain('Ticket médio', 'Receita vinculada a agendamentos dividida pela quantidade de agendamentos distintos com recebimento no período.', 'Pagamentos/lançamentos vinculados a agendamento.')} />
        <Stat label={`Agendamentos · ${view.cancelados} cancelados (${view.cancelPct}%)`} value={view.total} tone="warning" onPress={() => router.push('/(tabs)/agenda' as Href)} />
        <Stat label="Despesas" value={money(view.despesa)} tone="danger" onPress={() => router.push('/modules/fluxo-caixa' as Href)} />
        <Stat label="Média diária de agendamentos" value={(view.total / (days || 1)).toFixed(1)} onPress={() => explain('Média diária de atendimentos', 'Total de agendamentos ÷ quantidade inclusiva de dias do período.', 'Agendamentos, campo data.')} />
        <Stat label="Triagens no período" value={view.triagens} onPress={() => explain('Triagens', 'Quantidade de registros criados dentro do período selecionado.', 'Triagens, campo created_at.')} />
        <Stat label={`Satisfação · ${view.feedbacks} avaliação(ões)`} value={view.nps === null ? '—' : view.nps.toFixed(1)} tone="info" onPress={() => explain('Satisfação', 'Média das notas recebidas nas pesquisas de satisfação do período.', 'Feedbacks NPS, campo created_at.')} />
      </View>
      <Section title="Agendamentos por status">
        <Card>{view.status.length ? view.status.map(s => <Bar key={s.name} label={s.name} value={s.value} max={maxStatus} text={String(s.value)} />) : <Text style={styles.muted}>Sem agendamentos no período.</Text>}</Card>
      </Section>
      <Section title="Produtividade por médico">
        <Card>{view.prod.length ? view.prod.map(p => <Bar key={`${p.nome}-${p.esp}`} label={`${p.nome} · ${p.esp}`} value={p.total} max={maxProd} text={`${p.total} · ${p.total ? Math.round((p.fin / p.total) * 100) : 0}% finalizados`} />) : <Text style={styles.muted}>Sem agendamentos no período.</Text>}</Card>
      </Section>
      <Section title="Classificação de risco na triagem">
        <Card>{view.risco.length ? view.risco.map(r => <Bar key={r.key} label={r.label} value={r.value} max={maxRisco} text={String(r.value)} color={r.color} />) : <Text style={styles.muted}>Sem triagens classificadas no período.</Text>}</Card>
      </Section>
      <Section title="No navegador">
        <Text style={styles.note}>Comparação com o período anterior, período personalizado, gráficos diários e a lista de comentários de satisfação ficam no navegador.</Text>
        <OpenOnWeb path="/analytics" />
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, muted: { color: colors.muted, fontSize: 12 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 10 },
  bar: { marginVertical: 5 }, barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 }, barLabel: { flex: 1, color: colors.muted, fontSize: 11 }, barValue: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }, fill: { height: 8, borderRadius: 4 },
});
