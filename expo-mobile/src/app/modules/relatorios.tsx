import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Button, Card, Chips, Section, Stat, StateView } from '../../components/ui';
import { clinicDate, dateLabel, money } from '../../lib/format';
import { must, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Lanc = { id: string; tipo: string; categoria: string | null; valor: number; valor_pago: number | null; desconto: number | null; acrescimo: number | null; data: string; data_pagamento: string | null; data_vencimento: string | null; status: string; forma_pagamento: string | null; agendamento_id: string | null };
type Conta = { agendamento_id: string | null; tipo: string };
type Pag = { id: string; lancamento_id: string; valor: number; data_pagamento: string | null; estornado_em: string | null; forma_pagamento: string | null; lancamentos: Conta | Conta[] | null };
type Ag = { id: string; data: string; status: string; medico_id: string; tipo: string | null };
type Medico = { id: string; nome: string | null; crm: string; especialidade: string | null };
type Ev = { tipo: string; agendamentoId: string | null; data: string; valor: number; forma: string | null };

const LIMIT = 20000;
const FINAL = new Set(['finalizado', 'atendimento_finalizado']);
const PERIODS = [{ value: 'mes_atual', label: 'Mês atual' }, { value: 'mes_anterior', label: 'Mês anterior' }, { value: 'ultimos_3_meses', label: 'Últimos 3 meses' }, { value: 'ultimos_6_meses', label: 'Últimos 6 meses' }, { value: 'ultimos_12_meses', label: 'Últimos 12 meses' }, { value: 'este_ano', label: 'Este ano' }];
const LANC_COLS = 'id, tipo, categoria, valor, valor_pago, desconto, acrescimo, data, data_pagamento, data_vencimento, status, forma_pagamento, agendamento_id';
const realized = (l: Lanc) => (l.valor_pago !== null && l.valor_pago !== undefined && Number.isFinite(Number(l.valor_pago)) ? Number(l.valor_pago) : Number(l.valor) || 0);
const openValue = (l: Lanc) => Math.max(0, Number(l.valor || 0) - Number(l.desconto || 0) + Number(l.acrescimo || 0) - Number(l.valor_pago || 0));
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
/** Same period boundaries as the web pills, in the clinic's calendar. */
function range(period: string) {
  const today = clinicDate();
  const m = today.slice(0, 7);
  switch (period) {
    case 'mes_anterior': return { start: `${shiftMonth(m, -1)}-01`, end: addDay(`${m}-01`, -1) };
    case 'ultimos_3_meses': return { start: `${shiftMonth(m, -2)}-01`, end: today };
    case 'ultimos_6_meses': return { start: `${shiftMonth(m, -5)}-01`, end: today };
    case 'ultimos_12_meses': return { start: `${shiftMonth(m, -11)}-01`, end: today };
    case 'este_ano': return { start: `${today.slice(0, 4)}-01-01`, end: today };
    default: return { start: `${m}-01`, end: today };
  }
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

export default function ReportsScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const agenda = !!profile?.roles.some(r => ['admin', 'medico', 'enfermagem'].includes(r));
  const [period, setPeriod] = useState('mes_atual');
  const { start, end } = range(period);
  const go = (path: string) => router.push(path as Href);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const lanc = (col: string) => fetchAll<Lanc>(() => client.from('lancamentos').select(LANC_COLS).eq('clinica_id', clinicId).gte(col, start).lte(col, end).order(col, { ascending: false }).order('id'));
    const pags = () => client.from('pagamentos').select('id, lancamento_id, valor, data_pagamento, estornado_em, forma_pagamento, lancamentos!inner(agendamento_id, tipo, clinica_id)').eq('clinica_id', clinicId).eq('lancamentos.clinica_id', clinicId).order('id', { ascending: true });
    const from = startIso(start); const to = startIso(addDay(end, 1));
    const [emitidos, pagos, vencidos, paid, reversed, ags, medicos] = await Promise.all([
      lanc('data'), lanc('data_pagamento'), lanc('data_vencimento'),
      fetchAll<Pag>(() => pags().gte('data_pagamento', from).lt('data_pagamento', to)),
      fetchAll<Pag>(() => pags().not('estornado_em', 'is', null).gte('estornado_em', from).lt('estornado_em', to)),
      agenda ? fetchAll<Ag>(() => client.from('agendamentos').select('id, data, status, medico_id, tipo').eq('clinica_id', clinicId).gte('data', start).lte('data', end).order('data').order('id')) : Promise.resolve([] as Ag[]),
      agenda ? fetchAll<Medico>(() => client.from('medicos').select('id, nome, crm, especialidade').eq('clinica_id', clinicId).order('nome').order('id')) : Promise.resolve([] as Medico[]),
    ]);
    const lancs = [...new Map([...emitidos, ...pagos, ...vencidos].map(l => [l.id, l])).values()];
    // Settled accounts with any payment row (even outside the period) are counted only through their payment rows.
    const settledIds = lancs.filter(l => ['pago', 'parcial'].includes(l.status)).map(l => l.id);
    const withHistory = new Set<string>();
    for (let i = 0; i < settledIds.length; i += 250) for (const p of await fetchAll<{ lancamento_id: string }>(() => client.from('pagamentos').select('id, lancamento_id').eq('clinica_id', clinicId).in('lancamento_id', settledIds.slice(i, i + 250)).order('id', { ascending: true }))) withHistory.add(p.lancamento_id);
    const pagamentos = [...new Map([...paid, ...reversed].map(p => [p.id, p])).values()];
    return { lancs, pagamentos, withHistory, ags, medicos, capped: [lancs.length, pagamentos.length, ags.length].some(n => n >= LIMIT) };
  }, [clinicId, start, end, agenda]);

  // Mirrors the Financeiro/Atendimentos summary of src/pages/Relatorios.tsx.
  const view = useMemo(() => {
    if (!data) return null;
    const inRange = (d?: string | null) => { const day = d?.slice(0, 10); return !!day && day >= start && day <= end; };
    const lancs = data.lancs.filter(l => inRange(l.data) || inRange(l.data_pagamento) || inRange(l.data_vencimento));
    const withPayments = new Set([...data.pagamentos.map(p => p.lancamento_id), ...data.withHistory]);
    const events: Ev[] = lancs.filter(l => ['pago', 'parcial'].includes(l.status) && !withPayments.has(l.id))
      .map(l => ({ tipo: l.tipo, agendamentoId: l.agendamento_id, data: spDay(l.data_pagamento || l.data), valor: realized(l), forma: l.forma_pagamento })).filter(e => e.data >= start && e.data <= end);
    for (const p of data.pagamentos) {
      const conta = Array.isArray(p.lancamentos) ? p.lancamentos[0] : p.lancamentos;
      if (!conta || !['receita', 'despesa'].includes(conta.tipo) || !p.data_pagamento) continue;
      const paidDay = spDay(p.data_pagamento);
      if (paidDay >= start && paidDay <= end) events.push({ tipo: conta.tipo, agendamentoId: conta.agendamento_id, data: paidDay, valor: Number(p.valor), forma: p.forma_pagamento });
      if (p.estornado_em) { const d = spDay(p.estornado_em); if (d >= start && d <= end) events.push({ tipo: conta.tipo, agendamentoId: conta.agendamento_id, data: d, valor: -Number(p.valor), forma: p.forma_pagamento }); }
    }
    const receitas = events.filter(e => e.tipo === 'receita').reduce((a, e) => a + e.valor, 0);
    const despesas = events.filter(e => e.tipo === 'despesa').reduce((a, e) => a + e.valor, 0);
    const atend = events.filter(e => e.tipo === 'receita' && e.agendamentoId);
    const comRecebimento = new Set(atend.map(e => e.agendamentoId)).size;
    const pendentes = lancs.filter(l => { const d = (l.data_vencimento || l.data)?.slice(0, 10); return ['pendente', 'parcial', 'atrasado'].includes(l.status) && !!d && d >= start && d <= end; }).reduce((a, l) => a + openValue(l), 0);
    const ags = data.ags.filter(a => a.data >= start && a.data <= end);
    const finalizados = ags.filter(a => FINAL.has(a.status)).length;
    const faltas = ags.filter(a => a.status === 'faltou').length;
    const formas: Record<string, number> = {};
    for (const e of events) if (e.tipo === 'receita') { const f = e.forma || 'Não informado'; formas[f] = (formas[f] || 0) + e.valor; }
    const medicos = data.medicos.map(m => { const list = ags.filter(a => a.medico_id === m.id); const fin = list.filter(a => FINAL.has(a.status)).length; return { nome: m.nome || m.crm, esp: m.especialidade || 'Geral', total: list.length, fin, taxa: list.length ? Math.round((fin / list.length) * 100) : 0 }; }).sort((a, b) => b.total - a.total);
    return {
      receitas, despesas, lucro: receitas - despesas, pendentes, ticket: comRecebimento ? atend.reduce((a, e) => a + e.valor, 0) / comRecebimento : null, comRecebimento,
      total: ags.length, finalizados, faltas, cancelamentos: ags.filter(a => a.status === 'cancelado').length, taxa: finalizados + faltas > 0 ? Math.round((finalizados / (finalizados + faltas)) * 100) : null,
      formas: Object.entries(formas).map(([name, value]) => ({ name: name.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()), value })).sort((a, b) => b.value - a.value),
      medicos: medicos.filter(m => m.total > 0),
    };
  }, [data, start, end]);

  const explain = (title: string, message: string) => Alert.alert(title, message);
  const maxForma = Math.max(0, ...(view?.formas ?? []).map(f => f.value));
  const maxMedico = Math.max(0, ...(view?.medicos ?? []).map(m => m.total));

  return <ModuleScreen moduleKey="relatorios" subtitle={`${dateLabel(start)} a ${dateLabel(end)} · resumo financeiro${agenda ? ' e de atendimentos' : ''}`} refreshing={refreshing} onRefresh={refresh}>
    <Chips label="Período" options={PERIODS} value={period} onChange={setPeriod} />
    {loading ? <StateView loading title="Carregando relatórios…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os relatórios" message={error} onAction={reload} /> : !view ? <StateView icon="business-outline" title="Clínica não identificada" /> : <>
      {data?.capped ? <Text accessibilityRole="alert" style={styles.warn}>O limite de {LIMIT.toLocaleString('pt-BR')} registros foi atingido. Os totais podem estar incompletos.</Text> : null}
      <Section title="Financeiro">
        <View style={styles.stats}>
          <Stat label="Receitas recebidas" value={money(view.receitas)} tone="success" onPress={() => go('/modules/fluxo-caixa')} />
          <Stat label="Despesas pagas" value={money(view.despesas)} tone="danger" onPress={() => go('/modules/fluxo-caixa')} />
          <Stat label="Resultado" value={money(view.lucro)} tone={view.lucro >= 0 ? 'success' : 'danger'} onPress={() => explain('Resultado', 'Receitas menos despesas pagas no período. Cada pagamento conta na data em que ocorreu; estornos são descontados na data do estorno.')} />
          <Stat label="Em aberto no período" value={money(view.pendentes)} tone="warning" onPress={() => go('/modules/contas')} />
          <Stat label={`Ticket médio · ${view.comRecebimento} atendimento(s)`} value={view.ticket === null ? '—' : money(view.ticket)} onPress={() => explain('Ticket médio', 'Receita vinculada a agendamentos dividida pela quantidade de agendamentos distintos com recebimento no período.')} />
        </View>
      </Section>
      <Section title="Receitas por forma de pagamento">
        <Card>{view.formas.length ? view.formas.map(f => <Bar key={f.name} label={f.name} value={f.value} max={maxForma} text={money(f.value)} color={colors.success} />) : <Text style={styles.muted}>Sem receitas no período.</Text>}</Card>
      </Section>
      {agenda ? <>
        <Section title="Atendimentos">
          <View style={styles.stats}>
            <Stat label="Agendamentos no período" value={view.total} onPress={() => go('/(tabs)/agenda')} />
            <Stat label="Finalizados" value={view.finalizados} tone="success" onPress={() => explain('Finalizados', 'Agendamentos do período com status finalizado ou atendimento finalizado.')} />
            <Stat label={`Cancelamentos · ${view.faltas} falta(s)`} value={view.cancelamentos} tone="danger" onPress={() => explain('Cancelamentos e faltas', 'Agendamentos do período com status cancelado; faltas são os marcados como faltou.')} />
            <Stat label="Taxa de comparecimento" value={view.taxa === null ? '—' : `${view.taxa}%`} onPress={() => explain('Taxa de comparecimento', 'Atendimentos finalizados divididos pela soma de finalizados e faltas. Agendamentos futuros, em andamento e cancelados ficam fora.')} />
          </View>
        </Section>
        <Section title="Por médico">
          <Card>{view.medicos.length ? view.medicos.map(m => <Bar key={m.nome} label={`${m.nome} · ${m.esp}`} value={m.total} max={maxMedico} text={`${m.total} (${m.taxa}% finalizados)`} />) : <Text style={styles.muted}>Sem atendimentos no período.</Text>}</Card>
        </Section>
      </> : null}
      <Section title="Relatórios completos">
        <Text style={styles.note}>O relatório customizado, DRE detalhado, pacientes, estoque, status, período personalizado e as exportações em planilha ou PDF ficam no navegador.</Text>
        <View style={styles.actions}><OpenOnWeb path="/relatorios" /><Button variant="ghost" icon="star-outline" label="Relatórios salvos" onPress={() => go('/modules/relatorios-salvos')} /></View>
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, muted: { color: colors.muted, fontSize: 12 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 6 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bar: { marginVertical: 5 }, barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 }, barLabel: { flex: 1, color: colors.muted, fontSize: 11 }, barValue: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }, fill: { height: 8, borderRadius: 4 },
});
