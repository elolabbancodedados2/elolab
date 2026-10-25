import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Card, ListRow, Section, Segmented, Stat, StateView } from '../../components/ui';
import { clinicDate, money } from '../../lib/format';
import { must, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Conta = { tipo: string; categoria: string | null };
type Lanc = { id: string; tipo: string; categoria: string | null; valor: number; valor_pago: number | null; desconto: number | null; acrescimo: number | null; data: string; data_pagamento: string | null; data_vencimento: string | null; status: string | null };
type Pag = { id: string; lancamento_id: string; valor: number; data_pagamento: string; estornado_em: string | null; lancamentos: Conta | Conta[] | null };
type Ev = { tipo: string; categoria: string; data: string; valor: number };
type Tab = 'evolucao' | 'dre' | 'categorias';

const LIMIT = 20000;
const LANC_COLS = 'id, tipo, categoria, valor, valor_pago, desconto, acrescimo, data, data_pagamento, data_vencimento, status';
const RECEITA: Record<string, string> = { consulta: 'Consultas', retorno: 'Retornos', procedimento: 'Procedimentos', exame: 'Exames', cirurgia: 'Cirurgias', internacao: 'Internações', taxa_administrativa: 'Taxas Admin.', taxa_material: 'Taxas Material', convenio_repasse: 'Repasse Convênio', honorario_medico: 'Honorários', fisioterapia: 'Fisioterapia', psicologia: 'Psicologia', pediatria: 'Pediatria', outros: 'Outros' };
const DESPESA: Record<string, string> = { fornecedores: 'Fornecedores', folha_pagamento: 'Folha Pagamento', impostos: 'Impostos', aluguel: 'Aluguel', servicos: 'Serviços', equipamentos: 'Equipamentos', marketing: 'Marketing', outros: 'Outros' };
const settled = (s: string | null) => s === 'pago' || s === 'parcial';
const open = (s: string | null) => ['pendente', 'atrasado', 'parcial'].includes(s || '');
const openValue = (l: Lanc) => Math.max(0, Number(l.valor) - Number(l.desconto || 0) + Number(l.acrescimo || 0) - Number(l.valor_pago || 0));
const realized = (l: Lanc) => (l.valor_pago !== null && l.valor_pago !== undefined && Number.isFinite(Number(l.valor_pago)) ? Number(l.valor_pago) : Number(l.valor) || 0);
const pct1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const pct = (v: number) => `${pct1.format(v)}%`;
// Same abbreviation as formatarValorAbreviadoFinanceiro on the web.
const short = (v: number) => Math.abs(v) >= 1e6 ? `R$ ${pct1.format(v / 1e6)} mi` : Math.abs(v) >= 1e3 ? `R$ ${pct1.format(v / 1e3)} mil` : money(v);
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const monthLabel = (m: string, fmt: 'long' | 'short' = 'long') => new Intl.DateTimeFormat('pt-BR', { month: fmt, year: fmt === 'long' ? 'numeric' : '2-digit', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
// shortcut: São Paulo has had a fixed UTC-3 offset since 2019; use Intl offset math if older history is ever loaded here.
const startIso = (day: string) => new Date(`${day}T00:00:00-03:00`).toISOString();
function spDay(value: string) {
  if (!value.includes('T') && !value.includes(' ')) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const p = (t: string) => parts.find(x => x.type === t)?.value ?? '';
  return `${p('year')}-${p('month')}-${p('day')}`;
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

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 && value > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return <View accessible accessibilityLabel={`${label}: ${money(value)}`} style={styles.bar}>
    <View style={styles.barHead}><Text numberOfLines={1} style={styles.barLabel}>{label}</Text><Text style={styles.barValue}>{money(value)}</Text></View>
    <View style={styles.track}><View style={[styles.fill, { width: `${width}%`, backgroundColor: color }]} /></View>
  </View>;
}

export default function FinanceScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const thisMonth = clinicDate().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [tab, setTab] = useState<Tab>('evolucao');
  const go = (path: string) => router.push(path as Href);
  const explain = (title: string, message: string) => Alert.alert(title, message);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const from = `${shiftMonth(month, -5)}-01`;
    const to = `${shiftMonth(month, 1)}-01`;
    const pags = () => client.from('pagamentos').select('id,lancamento_id,valor,data_pagamento,estornado_em,lancamentos!inner(tipo,categoria,clinica_id)').eq('clinica_id', clinicId).eq('lancamentos.clinica_id', clinicId).order('id');
    const [lancs, paid, reversed] = await Promise.all([
      fetchAll<Lanc>(() => client.from('lancamentos').select(LANC_COLS).eq('clinica_id', clinicId).order('data', { ascending: false }).order('id')),
      fetchAll<Pag>(() => pags().gte('data_pagamento', startIso(from)).lt('data_pagamento', startIso(to))),
      fetchAll<Pag>(() => pags().not('estornado_em', 'is', null).gte('estornado_em', startIso(from)).lt('estornado_em', startIso(to))),
    ]);
    return { lancs, pags: [...new Map([...paid, ...reversed].map(p => [p.id, p])).values()], from, to };
  }, [clinicId, month]);

  // Mirrors src/pages/Financeiro.tsx: individual payments/reversals by date, legacy settled accounts by consolidated value.
  const view = useMemo(() => {
    if (!data) return null;
    const { lancs, pags, from, to } = data;
    const withPayments = new Set(pags.map(p => p.lancamento_id));
    const events: Ev[] = pags.flatMap(p => {
      const conta = Array.isArray(p.lancamentos) ? p.lancamentos[0] : p.lancamentos;
      if (!conta || !['receita', 'despesa'].includes(conta.tipo)) return [];
      const out: Ev[] = [];
      const paidDay = spDay(p.data_pagamento);
      if (paidDay >= from && paidDay < to) out.push({ tipo: conta.tipo, categoria: conta.categoria || 'outros', data: paidDay, valor: Number(p.valor) });
      if (p.estornado_em) {
        const revDay = spDay(p.estornado_em);
        if (revDay >= from && revDay < to) out.push({ tipo: conta.tipo, categoria: conta.categoria || 'outros', data: revDay, valor: -Number(p.valor) });
      }
      return out;
    });
    for (const l of lancs) {
      if (!settled(l.status) || withPayments.has(l.id)) continue;
      const day = spDay(l.data_pagamento || l.data);
      if (day >= from && day < to) events.push({ tipo: l.tipo, categoria: l.categoria || 'outros', data: day, valor: realized(l) });
    }
    const sum = (list: Ev[], tipo: string) => list.filter(e => e.tipo === tipo).reduce((a, e) => a + e.valor, 0);
    const inMonth = (d: string | null | undefined, m: string) => !!d && d.slice(0, 7) === m;
    const monthEvents = events.filter(e => inMonth(e.data, month));
    const prevEvents = events.filter(e => inMonth(e.data, shiftMonth(month, -1)));
    const dueThisMonth = lancs.filter(l => inMonth(l.data_vencimento || l.data, month));
    const receitas = dueThisMonth.filter(l => l.tipo === 'receita');
    const despesas = dueThisMonth.filter(l => l.tipo === 'despesa');
    const recebido = sum(monthEvents, 'receita');
    const pago = sum(monthEvents, 'despesa');
    const aReceber = receitas.filter(l => open(l.status)).reduce((a, l) => a + openValue(l), 0);
    const aPagar = despesas.filter(l => open(l.status)).reduce((a, l) => a + openValue(l), 0);
    const recebidoDasContas = receitas.filter(l => settled(l.status)).reduce((a, l) => a + realized(l), 0);
    const today = clinicDate();
    const vencidas = lancs.filter(l => l.tipo === 'receita' && open(l.status) && !!l.data_vencimento && l.data_vencimento < today);
    const recAnt = sum(prevEvents, 'receita');
    const desAnt = sum(prevEvents, 'despesa');
    const byCat = (tipo: string, labels: Record<string, string>) => {
      const map: Record<string, number> = {};
      for (const e of monthEvents) if (e.tipo === tipo) map[e.categoria] = (map[e.categoria] || 0) + e.valor;
      return Object.entries(map).map(([cat, valor]) => ({ cat, label: labels[cat] || cat, valor })).sort((a, b) => b.valor - a.valor);
    };
    const lucro = recebido - pago;
    return {
      recebido, pago, aReceber, aPagar, saldo: lucro,
      vencido: vencidas.reduce((a, l) => a + openValue(l), 0), countVencidas: vencidas.length,
      countReceber: receitas.filter(l => open(l.status)).length, countPagar: despesas.filter(l => open(l.status)).length,
      taxa: recebidoDasContas + aReceber > 0 ? (recebidoDasContas / (recebidoDasContas + aReceber)) * 100 : 0,
      varReceita: recAnt > 0 ? ((recebido - recAnt) / recAnt) * 100 : 0, varDespesa: desAnt > 0 ? ((pago - desAnt) / desAnt) * 100 : 0,
      receitaNova: recAnt === 0 && recebido > 0, despesaNova: desAnt === 0 && pago > 0,
      margem: recebido > 0 ? (lucro / recebido) * 100 : null,
      receitasCat: byCat('receita', RECEITA), despesasCat: byCat('despesa', DESPESA),
      months: Array.from({ length: 6 }, (_, i) => { const m = shiftMonth(month, i - 5); const ev = events.filter(e => inMonth(e.data, m)); return { m, rec: sum(ev, 'receita'), des: sum(ev, 'despesa') }; }),
      capped: lancs.length >= LIMIT || pags.length >= LIMIT,
    };
  }, [data, month]);

  const trend = (v: number, nova: boolean, goodUp: boolean) => nova ? 'Sem base no mês anterior' : v ? `${v > 0 ? '▲' : '▼'} ${pct(Math.abs(v))} vs mês anterior${(v > 0) === goodUp ? '' : ' (atenção)'}` : null;
  const maxMonth = Math.max(0, ...(view?.months ?? []).flatMap(r => [r.rec, r.des]));

  return <ModuleScreen moduleKey="financeiro" subtitle="Análise de receitas, despesas e resultados realizados." refreshing={refreshing} onRefresh={refresh}>
    <View style={styles.monthNav}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" hitSlop={6} onPress={() => setMonth(shiftMonth(month, -1))} style={styles.navBtn}><Ionicons name="chevron-back" size={20} color={colors.primary} /></Pressable>
      <Text accessibilityRole="header" style={styles.monthText}>{monthLabel(month)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" hitSlop={6} onPress={() => setMonth(shiftMonth(month, 1))} style={styles.navBtn}><Ionicons name="chevron-forward" size={20} color={colors.primary} /></Pressable>
      {month !== thisMonth ? <Pressable accessibilityRole="button" onPress={() => setMonth(thisMonth)} style={styles.today}><Text style={styles.todayText}>Hoje</Text></Pressable> : null}
    </View>
    {loading ? <StateView loading title="Carregando painel financeiro…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o painel financeiro" message={`${error} Os indicadores foram pausados para evitar valores incompletos.`} onAction={reload} /> : !view ? <StateView icon="business-outline" title="Clínica não identificada" /> : <>
      {view.capped ? <Text accessibilityRole="alert" style={styles.warn}>O painel atingiu o limite de {LIMIT.toLocaleString('pt-BR')} registros. Os totais podem estar incompletos; confira os relatórios antes do fechamento.</Text> : null}
      <View style={styles.stats}>
        <Stat label="Receita recebida" value={short(view.recebido)} tone="success" onPress={() => go('/modules/fluxo-caixa')} />
        <Stat label={view.countReceber ? `A receber · ${view.countReceber} em aberto` : 'A receber'} value={short(view.aReceber)} onPress={() => go('/modules/contas')} />
        <Stat label="Despesas pagas" value={short(view.pago)} tone="danger" onPress={() => go('/modules/fluxo-caixa')} />
        <Stat label="Resultado líquido" value={short(view.saldo)} tone={view.saldo >= 0 ? 'success' : 'danger'} onPress={() => setTab('dre')} />
      </View>
      {[trend(view.varReceita, view.receitaNova, true) && `Receita: ${trend(view.varReceita, view.receitaNova, true)}`, trend(view.varDespesa, view.despesaNova, false) && `Despesas: ${trend(view.varDespesa, view.despesaNova, false)}`].filter(Boolean).map(t => <Text key={t as string} style={styles.trend}>{t}</Text>)}
      <View style={styles.stats}>
        <Stat label={`Atrasos acumulados · ${view.countVencidas} ${view.countVencidas === 1 ? 'conta vencida' : 'contas vencidas'}`} value={money(view.vencido)} tone="danger" onPress={() => go('/modules/inadimplentes')} />
        <Stat label={view.countPagar ? `A pagar · ${view.countPagar} em aberto` : 'A pagar'} value={money(view.aPagar)} tone="warning" onPress={() => go('/modules/contas?tab=pagar')} />
        <Stat label="Taxa de recebimento" value={`${view.taxa.toFixed(0)}%`} onPress={() => explain('Taxa de recebimento', 'Valor já recebido das receitas com vencimento no mês dividido por esse valor somado ao que ainda está em aberto nas mesmas contas.')} />
        <Stat label="Margem de lucro" value={view.margem === null ? '—' : pct(view.margem)} tone={view.margem === null ? 'neutral' : view.margem >= 0 ? 'success' : 'danger'} onPress={() => view.margem === null ? explain('Margem de lucro', 'Sem receita para calcular no período.') : setTab('dre')} />
      </View>
      <View style={styles.gap} />
      <Segmented options={[{ value: 'evolucao', label: 'Evolução' }, { value: 'dre', label: 'DRE' }, { value: 'categorias', label: 'Categorias' }]} value={tab} onChange={setTab} />
      {tab === 'evolucao' ? <Card>
        <Text style={styles.cardTitle}>Fluxo de caixa — últimos 6 meses</Text><Text style={styles.caption}>Receitas e despesas realizadas</Text>
        {view.months.map(r => <View key={r.m} style={styles.monthRow}>
          <Text style={styles.monthRowTitle}>{monthLabel(r.m, 'short')} · Lucro {money(r.rec - r.des)}</Text>
          <Bar label="Receitas" value={r.rec} max={maxMonth} color={colors.success} />
          <Bar label="Despesas" value={r.des} max={maxMonth} color={colors.danger} />
        </View>)}
      </Card> : tab === 'dre' ? <Card>
        <Text style={styles.cardTitle}>DRE — {monthLabel(month)}</Text><Text style={styles.caption}>Receitas e despesas realizadas (pagas)</Text>
        <Text style={[styles.dreHead, { color: colors.success }]}>Receitas operacionais</Text>
        {view.receitasCat.length ? view.receitasCat.map(r => <View key={r.cat} style={styles.line}><Text style={styles.lineLabel}>{r.label}</Text><Text style={[styles.lineValue, { color: colors.success }]}>{money(r.valor)}</Text></View>) : <Text style={styles.caption}>Nenhuma receita no período.</Text>}
        <View style={styles.line}><Text style={styles.total}>Total receitas</Text><Text style={[styles.total, { color: colors.success }]}>{money(view.recebido)}</Text></View>
        <Text style={[styles.dreHead, { color: colors.danger }]}>Despesas operacionais</Text>
        {view.despesasCat.length ? view.despesasCat.map(r => <View key={r.cat} style={styles.line}><Text style={styles.lineLabel}>{r.label}</Text><Text style={[styles.lineValue, { color: colors.danger }]}>-{money(r.valor)}</Text></View>) : <Text style={styles.caption}>Nenhuma despesa no período.</Text>}
        <View style={styles.line}><Text style={styles.total}>Total despesas</Text><Text style={[styles.total, { color: colors.danger }]}>-{money(view.pago)}</Text></View>
        <View style={[styles.line, styles.result]}><View><Text style={styles.total}>Resultado operacional</Text><Text style={styles.caption}>{view.margem === null ? 'Sem receita para calcular a margem no período.' : `Margem: ${pct(view.margem)}`}</Text></View><Text style={[styles.big, { color: !view.recebido && !view.pago ? colors.muted : view.saldo >= 0 ? colors.success : colors.danger }]}>{view.saldo < 0 ? '-' : ''}{money(Math.abs(view.saldo))}</Text></View>
      </Card> : <>
        <Card><Text style={[styles.cardTitle, { color: colors.success }]}>Receitas por categoria</Text>
          {view.receitasCat.length ? view.receitasCat.map(r => <Bar key={r.cat} label={r.label} value={r.valor} max={view.receitasCat[0].valor} color={colors.success} />) : <Text style={styles.caption}>Sem dados</Text>}
        </Card>
        <View style={styles.gap} />
        <Card><Text style={[styles.cardTitle, { color: colors.danger }]}>Despesas por categoria</Text>
          {view.despesasCat.length ? view.despesasCat.map(r => <Bar key={r.cat} label={`${r.label} (${view.pago > 0 ? ((r.valor / view.pago) * 100).toFixed(0) : 0}%)`} value={r.valor} max={view.despesasCat[0].valor} color={colors.danger} />) : <Text style={styles.caption}>Sem dados</Text>}
        </Card>
      </>}
      <Section title="Acesso rápido">
        <ListRow icon="cash-outline" tone="success" title="Recepção e caixa" subtitle="Abrir/fechar caixa, receber pagamentos" onPress={() => go('/modules/recepcao')} />
        <ListRow icon="trending-up-outline" title="Contas a receber" subtitle="Cobranças e recebimentos" onPress={() => go('/modules/contas')} />
        <ListRow icon="card-outline" tone="danger" title="Contas a pagar" subtitle="Fornecedores, salários e despesas" onPress={() => go('/modules/contas?tab=pagar')} />
        <ListRow icon="wallet-outline" tone="info" title="Fluxo de caixa" subtitle="Visão mensal de entradas e saídas" onPress={() => go('/modules/fluxo-caixa')} />
        <ListRow icon="pricetags-outline" tone="warning" title="Preços e serviços" subtitle="Consultas e exames" onPress={() => go('/modules/precos')} />
        <ListRow icon="bar-chart-outline" tone="info" title="Relatórios" subtitle="Resumo por período" onPress={() => go('/modules/relatorios')} />
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }, navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  monthText: { flex: 1, textAlign: 'center', color: colors.ink, fontSize: 15, fontWeight: '800', textTransform: 'capitalize' }, today: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }, todayText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }, trend: { color: colors.muted, fontSize: 11, marginTop: 6 }, gap: { height: 16 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 6 },
  cardTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' }, caption: { color: colors.muted, fontSize: 11, marginTop: 3, marginBottom: 8 },
  monthRow: { marginTop: 10 }, monthRowTitle: { color: colors.ink, fontSize: 12, fontWeight: '700', textTransform: 'capitalize', marginBottom: 4 },
  bar: { marginVertical: 5 }, barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 }, barLabel: { flex: 1, color: colors.muted, fontSize: 11 }, barValue: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }, fill: { height: 8, borderRadius: 4 },
  dreHead: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginTop: 12, marginBottom: 4 }, line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 8 },
  lineLabel: { flex: 1, color: colors.muted, fontSize: 12 }, lineValue: { fontSize: 12, fontWeight: '700' }, total: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  result: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 10, paddingTop: 12 }, big: { fontSize: 20, fontWeight: '800' },
});
