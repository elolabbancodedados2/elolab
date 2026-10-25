import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Field, Section, Stat, StateView, type Tone } from '../../components/ui';
import { money } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Client = { clinica_id: string; clinica_nome: string; suspensa: boolean; cliente_desde: string; dono_nome: string | null; dono_email: string | null; dono_telefone: string | null; plano_nome: string | null; plano_valor: number | null; assinatura_status: string | null; em_trial: boolean; vence_em: string | null; dias_para_vencer: number | null; total_medicos: number; total_pacientes: number; ultima_atividade: string | null; dias_sem_uso: number | null };
type Filter = 'todos' | 'pagantes' | 'vencendo' | 'vencidos' | 'paradas' | 'semAssinatura';

const subLabel: Record<string, string> = { ativa: 'Ativa', trial: 'Em teste', pendente: 'Pendente', cancelada: 'Cancelada', expirada: 'Expirada' };
const day = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? 'data indisponível' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d); };
const age = (since: string) => { const t = new Date(since).getTime(); return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86_400_000)) : 0; };
const whatsapp = (v: string) => { const d = v.replace(/\D/g, ''); if (d.length === 10 || d.length === 11) return `55${d}`; return d.length >= 12 && d.length <= 13 && d.startsWith('55') ? d : null; };
// Same rules as the web CRM: plan value is list price, so only paying, non-trial, in-period subscriptions count.
const paying = (c: Client) => c.assinatura_status === 'ativa' && !c.em_trial && !c.suspensa && (c.dias_para_vencer ?? -1) >= 0;
const tests: Record<Filter, (c: Client) => boolean> = {
  todos: () => true,
  pagantes: paying,
  vencendo: c => !['cancelada', 'expirada'].includes(c.assinatura_status || '') && (c.dias_para_vencer ?? 99) <= 7 && (c.dias_para_vencer ?? 99) >= 0,
  vencidos: c => c.assinatura_status === 'expirada' || (c.assinatura_status !== 'cancelada' && (c.dias_para_vencer ?? 0) < 0),
  paradas: c => (c.dias_sem_uso ?? age(c.cliente_desde)) >= 30,
  semAssinatura: c => c.assinatura_status === null,
};

function due(c: Client): { label: string; tone: Tone } {
  const d = c.dias_para_vencer;
  if (c.assinatura_status === 'cancelada') return { label: 'cancelada', tone: 'neutral' };
  if (c.assinatura_status === 'expirada') return { label: 'expirada', tone: 'danger' };
  if (d === null) return { label: 'sem assinatura', tone: 'neutral' };
  if (d < 0) { const e = c.vence_em ? (Date.now() - new Date(c.vence_em).getTime()) / 86_400_000 : Number.NaN; return { label: !Number.isFinite(e) ? `venceu há ${Math.abs(d)}d` : e < 1 ? 'venceu há menos de 1d' : `venceu há ${Math.floor(e)}d`, tone: 'danger' }; }
  if (d === 0) return { label: 'vence hoje', tone: 'danger' };
  return { label: d <= 7 ? `vence em ${d}d` : `em ${d} dias`, tone: d <= 7 ? 'warning' : 'neutral' };
}
function usage(c: Client): { label: string; tone: Tone } {
  const d = c.dias_sem_uso;
  if (d === null) return age(c.cliente_desde) < 30 ? { label: `sem atividade ainda · ${age(c.cliente_desde)}d de cliente`, tone: 'neutral' } : { label: 'sem atividade desde o cadastro', tone: 'danger' };
  return d >= 30 ? { label: `${d}d parada`, tone: 'danger' } : d >= 14 ? { label: `${d}d sem uso`, tone: 'warning' } : { label: `há ${d}d`, tone: 'neutral' };
}

export default function AdminCrmScreen() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => (must<Client[]>(await client.rpc('platform_crm_overview')) ?? []), []);
  const all = data ?? [];
  const n = (f: Filter) => all.filter(tests[f]).length;
  const revenue = all.filter(paying).reduce((s, c) => s + Number(c.plano_valor ?? 0), 0);
  const q = search.trim().toLowerCase();
  const phone = q.replace(/\D/g, '');
  const list = all.filter(tests[filter]).filter(c => !q || c.clinica_nome?.toLowerCase().includes(q) || c.dono_email?.toLowerCase().includes(q) || c.dono_nome?.toLowerCase().includes(q) || (phone.length > 0 && (c.dono_telefone?.replace(/\D/g, '').includes(phone) ?? false)));
  const toggle = (f: Filter) => setFilter(cur => cur === f ? 'todos' : f);
  const filtered = filter !== 'todos' || !!q;

  return <ModuleScreen moduleKey="admin-crm" subtitle={data ? `${all.length} clínicas clientes · ${n('vencendo')} vencendo em 7 dias · ${n('vencidos')} vencidas · ${n('paradas')} paradas há 30 dias+` : 'Suas clínicas clientes: receita, vencimentos e quem parou de usar.'} refreshing={refreshing} onRefresh={refresh}>
    {loading ? <StateView loading title="Carregando clientes…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : <>
      <View style={styles.grid}>
        <Stat label={`Soma dos valores cadastrados · ${n('pagantes')} em dia`} value={money(revenue)} onPress={() => toggle('pagantes')} />
        <Stat label="Vencendo em 7 dias" value={n('vencendo')} tone="warning" onPress={() => toggle('vencendo')} />
        <Stat label="Já vencidas" value={n('vencidos')} tone="danger" onPress={() => toggle('vencidos')} />
        <Stat label="Paradas há 30 dias+" value={n('paradas')} tone="danger" onPress={() => toggle('paradas')} />
      </View>
      <Text style={styles.note}>Soma nominal dos planos ativos. Não confirma recebimentos nem converte ciclos trimestrais, semestrais ou anuais em valor mensal.</Text>
      {n('semAssinatura') ? <Card style={styles.warn}>
        <Text style={styles.warnTitle}>{n('semAssinatura')} clínica(s) sem assinatura registrada</Text>
        <Text style={styles.muted}>Usam o sistema e nunca são bloqueadas — a regra libera quem não tem registro de assinatura. Se a intenção é cobrar, elas precisam de um plano.</Text>
        <Button variant="secondary" label={filter === 'semAssinatura' ? 'Mostrar todas' : 'Ver na lista'} onPress={() => toggle('semAssinatura')} />
      </Card> : null}
      <Section title="Clientes" action={<Text style={styles.muted}>{list.length} de {all.length}</Text>}>
        <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Buscar clínica, responsável, e-mail ou telefone" autoCapitalize="none" hint="Ordenados por vencimento — o que tem prazo vem primeiro." />
        {filtered ? <Button variant="ghost" label="Limpar filtros" onPress={() => { setFilter('todos'); setSearch(''); }} /> : null}
        {!list.length ? <StateView icon="business-outline" title={search ? `Nenhuma clínica encontrada para "${search}".` : filtered ? 'Nenhuma clínica neste filtro.' : 'Nenhuma clínica cadastrada.'} /> : list.map(c => {
          const v = due(c); const u = usage(c); const wa = c.dono_telefone ? whatsapp(c.dono_telefone) : null;
          return <Card key={c.clinica_id} style={[styles.item, c.suspensa && styles.dim]}>
            <View style={styles.row}><Text style={[styles.title, styles.fill]}>{c.clinica_nome}</Text>{c.suspensa ? <Badge label="suspensa" tone="danger" /> : null}</View>
            <Text style={styles.muted}>cliente desde {day(c.cliente_desde)} · {c.total_pacientes} pac · {c.total_medicos} méd</Text>
            <Text style={styles.body}>{c.plano_nome ? `${c.plano_nome} · ${c.plano_valor !== null ? `${money(c.plano_valor)} · valor cadastrado` : 'valor não informado'}${c.em_trial ? ' · teste' : ''}` : 'sem plano'}</Text>
            <View style={styles.row}>
              {c.assinatura_status ? <Badge label={subLabel[c.assinatura_status] || c.assinatura_status} tone={c.assinatura_status === 'ativa' ? 'success' : ['cancelada', 'expirada'].includes(c.assinatura_status) ? 'danger' : 'neutral'} /> : null}
              <Badge label={v.label} tone={v.tone} /><Badge label={u.label} tone={u.tone} />
            </View>
            {(c.dias_sem_uso ?? 0) >= 14 && c.ultima_atividade ? <Text style={styles.muted}>Último acesso ou registro: {day(c.ultima_atividade)}</Text> : null}
            {c.dono_nome || c.dono_email || c.dono_telefone ? <>
              <Text style={styles.body}>{c.dono_nome ?? '—'}{c.dono_telefone && !wa ? ` · ${c.dono_telefone}` : ''}</Text>
              <View style={styles.row}>
                {c.dono_email ? <Button variant="secondary" icon="mail-outline" label="E-mail" onPress={() => void Linking.openURL(`mailto:${c.dono_email}`)} /> : null}
                {wa ? <Button variant="secondary" icon="logo-whatsapp" label="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/${wa}`)} /> : null}
              </View>
            </> : <Text style={styles.muted}>sem dono definido</Text>}
          </Card>;
        })}
      </Section>
      <View style={styles.row}><Button variant="ghost" label="Clínicas" onPress={() => router.push('/modules/admin-clinicas' as never)} /><Button variant="ghost" label="Cobranças" onPress={() => router.push('/modules/admin-cobrancas' as never)} /></View>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }, fill: { flexGrow: 1, flexBasis: '60%' },
  item: { marginBottom: 10, gap: 6, padding: 12 }, dim: { opacity: 0.6 }, warn: { borderColor: colors.warning, backgroundColor: colors.warningSoft, gap: 8, marginTop: 12 }, warnTitle: { color: colors.warning, fontSize: 13, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 13, fontWeight: '700' }, body: { color: colors.ink, fontSize: 12 }, muted: { color: colors.muted, fontSize: 11, lineHeight: 16 }, note: { color: colors.muted, fontSize: 10, marginTop: 8 },
});
