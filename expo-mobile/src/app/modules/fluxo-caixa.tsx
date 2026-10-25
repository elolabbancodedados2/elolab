import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Button, Card, Section, Stat, StateView } from '../../components/ui';
import { clinicDate, dateLabel, money } from '../../lib/format';
import { must, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Conta = { tipo: string; categoria: string | null };
type Lanc = { id: string; tipo: string; categoria: string | null; valor: number; valor_pago: number | null; desconto: number | null; acrescimo: number | null; data: string; data_pagamento: string | null; data_vencimento: string | null; status: string | null };
type Pag = { id: string; lancamento_id: string; valor: number; data_pagamento: string; estornado_em: string | null; lancamentos: Conta | Conta[] | null };
type Ev = { tipo: string; categoria: string; data: string; valor: number };
type Group = 'receitas' | 'despesas' | 'suprimentos' | 'sangrias';

const LIMIT = 20000;
const GROUP: Record<string, Group> = { receita: 'receitas', despesa: 'despesas', suprimento: 'suprimentos', sangria: 'sangrias' };
const LABELS: Record<string, string> = {
  consulta: 'Consultas', retorno: 'Retornos', procedimento: 'Procedimentos', exame: 'Exames', cirurgia: 'Cirurgias', internacao: 'Internações', taxa_administrativa: 'Taxas administrativas',
  taxa_material: 'Materiais', convenio_repasse: 'Repasses de convênio', honorario_medico: 'Honorários médicos', fisioterapia: 'Fisioterapia', psicologia: 'Psicologia', pediatria: 'Pediatria', outros: 'Outros',
  fornecedores: 'Fornecedores', folha_pagamento: 'Folha de pagamento', impostos: 'Impostos', aluguel: 'Aluguel', servicos: 'Serviços', equipamentos: 'Equipamentos', marketing: 'Marketing',
  receita_caixa: 'Receitas avulsas', sangria: 'Sangrias', suprimento: 'Suprimentos', ajuste_convenio: 'Ajustes de convênio',
};
const label = (c: string) => LABELS[c] || c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toLocaleUpperCase('pt-BR'));
const settled = (s: string | null) => s === 'pago' || s === 'parcial';
const open = (s: string | null) => ['pendente', 'atrasado', 'parcial'].includes(s || '');
const openValue = (l: Lanc) => Math.max(0, Number(l.valor) - Number(l.desconto || 0) + Number(l.acrescimo || 0) - Number(l.valor_pago || 0));
const realized = (l: Lanc) => (l.valor_pago !== null && l.valor_pago !== undefined && Number.isFinite(Number(l.valor_pago)) ? Number(l.valor_pago) : Number(l.valor) || 0);
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const monthLabel = (m: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
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
/** Same as totaisMovimentoCaixa on the web: entries = receitas + suprimentos, exits = despesas + sangrias. */
function totals(list: Ev[]) {
  const t = { receitas: 0, despesas: 0, suprimentos: 0, sangrias: 0 };
  for (const e of list) { const g = GROUP[e.tipo]; if (g) t[g] += Number(e.valor) || 0; }
  const entradas = t.receitas + t.suprimentos;
  const saidas = t.despesas + t.sangrias;
  return { ...t, entradas, saidas, saldo: entradas - saidas };
}

function Bar({ text, value, max, color }: { text: string; value: number; max: number; color: string }) {
  const width = max > 0 && value > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  if (!value) return null;
  return <View accessible accessibilityLabel={`${text}: ${money(value)}`} style={styles.bar}>
    <View style={styles.barHead}><Text style={styles.barLabel}>{text}</Text><Text style={styles.barValue}>{money(value)}</Text></View>
    <View style={styles.track}><View style={[styles.fill, { width: `${width}%`, backgroundColor: color }]} /></View>
  </View>;
}

export default function CashFlowScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const thisMonth = clinicDate().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [allDays, setAllDays] = useState(false);
  const go = (path: string) => router.push(path as Href);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const from = `${shiftMonth(month, -1)}-01`;
    const to = `${shiftMonth(month, 1)}-01`;
    const pags = () => client.from('pagamentos').select('id, lancamento_id, valor, data_pagamento, estornado_em, lancamentos!inner(tipo, categoria, clinica_id)').eq('clinica_id', clinicId).eq('lancamentos.clinica_id', clinicId).order('id', { ascending: true });
    const [lancs, paid, reversed] = await Promise.all([
      fetchAll<Lanc>(() => client.from('lancamentos').select('id, tipo, categoria, valor, valor_pago, desconto, acrescimo, data, data_pagamento, data_vencimento, status').eq('clinica_id', clinicId).order('data', { ascending: false }).order('id')),
      fetchAll<Pag>(() => pags().gte('data_pagamento', startIso(from)).lt('data_pagamento', startIso(to))),
      fetchAll<Pag>(() => pags().not('estornado_em', 'is', null).gte('estornado_em', startIso(from)).lt('estornado_em', startIso(to))),
    ]);
    return { lancs, pags: [...new Map([...paid, ...reversed].map(p => [p.id, p])).values()] };
  }, [clinicId, month]);

  // Mirrors src/pages/FluxoCaixa.tsx.
  const view = useMemo(() => {
    if (!data) return null;
    const withPayments = new Set(data.pags.map(p => p.lancamento_id));
    const events: Ev[] = data.lancs.filter(l => settled(l.status) && !withPayments.has(l.id)).map(l => ({ tipo: l.tipo, categoria: l.categoria || 'outros', data: spDay(l.data_pagamento || l.data), valor: realized(l) }));
    for (const p of data.pags) {
      const conta = Array.isArray(p.lancamentos) ? p.lancamentos[0] : p.lancamentos;
      if (!conta || !GROUP[conta.tipo]) continue;
      const base = { tipo: conta.tipo, categoria: conta.categoria || 'outros' };
      events.push({ ...base, data: spDay(p.data_pagamento), valor: Number(p.valor) });
      if (p.estornado_em) events.push({ ...base, data: spDay(p.estornado_em), valor: -Number(p.valor) });
    }
    const inMonth = (d: string | null | undefined, m: string) => !!d && d.slice(0, 7) === m;
    const monthEvents = events.filter(e => inMonth(e.data, month));
    const t = totals(monthEvents);
    const prev = totals(events.filter(e => inMonth(e.data, shiftMonth(month, -1))));
    const openInMonth = data.lancs.filter(l => open(l.status) && inMonth(l.data_vencimento || l.data, month));
    const byDay = new Map<string, Ev[]>();
    for (const e of monthEvents) byDay.set(e.data, [...(byDay.get(e.data) ?? []), e]);
    let acc = 0;
    const days = [...byDay.keys()].sort().map(day => { const d = totals(byDay.get(day)!); acc += d.saldo; return { day, ...d, acumulado: acc }; });
    const cats: Record<string, Record<Group, number>> = {};
    for (const e of monthEvents) { const g = GROUP[e.tipo]; if (!g) continue; cats[e.categoria] ??= { receitas: 0, despesas: 0, suprimentos: 0, sangrias: 0 }; cats[e.categoria][g] += e.valor; }
    return {
      ...t, days, cats: Object.entries(cats).map(([c, v]) => ({ c, ...v })),
      receitasPendentes: openInMonth.filter(l => l.tipo === 'receita').reduce((a, l) => a + openValue(l), 0),
      despesasPendentes: openInMonth.filter(l => l.tipo === 'despesa').reduce((a, l) => a + openValue(l), 0),
      varReceita: prev.entradas > 0 ? ((t.entradas - prev.entradas) / prev.entradas) * 100 : 0, varDespesa: prev.saidas > 0 ? ((t.saidas - prev.saidas) / prev.saidas) * 100 : 0,
      receitaNova: prev.entradas === 0 && t.entradas > 0, despesaNova: prev.saidas === 0 && t.saidas > 0,
      capped: data.lancs.length >= LIMIT || data.pags.length >= LIMIT,
    };
  }, [data, month]);

  const trend = (v: number, nova: boolean) => nova ? 'Sem base no mês anterior' : v ? `${v > 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}% vs mês anterior` : null;
  const maxDay = Math.max(0, ...(view?.days ?? []).flatMap(d => [d.receitas, d.despesas, d.suprimentos, d.sangrias]));
  const maxCat = Math.max(0, ...(view?.cats ?? []).flatMap(c => [c.receitas, c.despesas, c.suprimentos, c.sangrias]));
  const days = view ? (allDays ? view.days : view.days.slice(-7)).slice().reverse() : [];

  return <ModuleScreen moduleKey="fluxo-caixa" subtitle="Entradas, saídas e saldo realizados no mês." refreshing={refreshing} onRefresh={refresh}>
    <View style={styles.monthNav}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" hitSlop={6} onPress={() => setMonth(shiftMonth(month, -1))} style={styles.navBtn}><Ionicons name="chevron-back" size={20} color={colors.primary} /></Pressable>
      <Text accessibilityRole="header" style={styles.monthText}>{monthLabel(month)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" hitSlop={6} onPress={() => setMonth(shiftMonth(month, 1))} style={styles.navBtn}><Ionicons name="chevron-forward" size={20} color={colors.primary} /></Pressable>
      {month !== thisMonth ? <Pressable accessibilityRole="button" onPress={() => setMonth(thisMonth)} style={styles.today}><Text style={styles.todayText}>Hoje</Text></Pressable> : null}
    </View>
    {loading ? <StateView loading title="Carregando fluxo de caixa…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o fluxo de caixa" message={error} onAction={reload} /> : !view ? <StateView icon="business-outline" title="Clínica não identificada" /> : <>
      {view.capped ? <Text accessibilityRole="alert" style={styles.warn}>A consulta atingiu o limite de {LIMIT.toLocaleString('pt-BR')} registros. Se houver mais movimentos, os totais podem estar incompletos.</Text> : null}
      <View style={styles.stats}>
        <Stat label="Entradas no mês" value={money(view.entradas)} tone="success" onPress={() => go('/modules/contas')} />
        <Stat label="Saídas no mês" value={money(view.saidas)} tone="danger" onPress={() => go('/modules/contas?tab=pagar')} />
        <Stat label={view.saldo < 0 ? 'Saldo negativo no mês' : 'Saldo do mês'} value={money(view.saldo)} tone={view.saldo < 0 ? 'danger' : 'primary'} onPress={() => Alert.alert('Saldo do mês', 'Entradas (receitas e suprimentos) menos saídas (despesas e sangrias) realizadas no mês. Não inclui saldo inicial de caixa.')} />
        <Stat label="Margem operacional" value={view.receitas > 0 ? `${(((view.receitas - view.despesas) / view.receitas) * 100).toFixed(1)}%` : '—'} onPress={() => Alert.alert('Margem operacional', '(Receitas − despesas) ÷ receitas realizadas no mês. Suprimentos e sangrias ficam fora.')} />
      </View>
      {[trend(view.varReceita, view.receitaNova) && `Entradas: ${trend(view.varReceita, view.receitaNova)}`, trend(view.varDespesa, view.despesaNova) && `Saídas: ${trend(view.varDespesa, view.despesaNova)}`,
        view.receitasPendentes > 0 && `Receitas em aberto com vencimento no mês: ${money(view.receitasPendentes)}`, view.despesasPendentes > 0 && `Despesas em aberto com vencimento no mês: ${money(view.despesasPendentes)}`]
        .filter(Boolean).map(t => <Text key={t as string} style={styles.trend}>{t}</Text>)}
      <Section title="Evolução diária" action={view.days.length > 7 ? <Button variant="ghost" label={allDays ? 'Últimos 7 dias' : `Todos (${view.days.length})`} onPress={() => setAllDays(!allDays)} /> : undefined}>
        {!days.length ? <StateView icon="trending-up-outline" title="Nenhuma movimentação registrada neste mês" message="A evolução diária aparecerá aqui quando houver entradas, saídas, suprimentos ou sangrias." /> : days.map(d => <Card key={d.day} style={styles.day}>
          <View style={styles.dayHead}><Text style={styles.dayTitle}>{dateLabel(d.day)}</Text><Text style={[styles.dayTitle, { color: d.saldo < 0 ? colors.danger : colors.success }]}>{money(d.saldo)}</Text></View>
          <Bar text="Receitas" value={d.receitas} max={maxDay} color={colors.success} />
          <Bar text="Despesas" value={d.despesas} max={maxDay} color={colors.danger} />
          <Bar text="Suprimentos" value={d.suprimentos} max={maxDay} color={colors.primary} />
          <Bar text="Sangrias" value={d.sangrias} max={maxDay} color={colors.warning} />
          <Text style={styles.caption}>Saldo acumulado no mês: {money(d.acumulado)}</Text>
        </Card>)}
      </Section>
      <Section title="Por categoria">
        {!view.cats.length ? <StateView icon="pie-chart-outline" title="Nenhuma movimentação neste mês" /> : view.cats.map(c => <Card key={c.c} style={styles.day}>
          <Text style={styles.dayTitle}>{label(c.c)}</Text>
          <Bar text="Receitas" value={c.receitas} max={maxCat} color={colors.success} />
          <Bar text="Despesas" value={c.despesas} max={maxCat} color={colors.danger} />
          <Bar text="Suprimentos" value={c.suprimentos} max={maxCat} color={colors.primary} />
          <Bar text="Sangrias" value={c.sangrias} max={maxCat} color={colors.warning} />
        </Card>)}
      </Section>
      <Section title="Caixa e mais recursos">
        <Text style={styles.note}>Abertura, fechamento e lançamentos do caixa do dia ficam em Recepção e caixa. A projeção de fluxo e a importação de extrato bancário pedem tela grande e continuam no navegador.</Text>
        <View style={styles.actions}><Button icon="cash-outline" label="Caixa do dia" onPress={() => go('/modules/recepcao')} /><OpenOnWeb path="/fluxo-caixa" label="Projeção e extrato" /></View>
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }, navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  monthText: { flex: 1, textAlign: 'center', color: colors.ink, fontSize: 15, fontWeight: '800', textTransform: 'capitalize' }, today: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }, todayText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, trend: { color: colors.muted, fontSize: 11, marginTop: 6 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 10 },
  day: { marginBottom: 8, padding: 12 }, dayHead: { flexDirection: 'row', justifyContent: 'space-between' }, dayTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, caption: { color: colors.muted, fontSize: 11, marginTop: 4 },
  bar: { marginTop: 6 }, barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }, barLabel: { color: colors.muted, fontSize: 11 }, barValue: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }, fill: { height: 8, borderRadius: 4 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
