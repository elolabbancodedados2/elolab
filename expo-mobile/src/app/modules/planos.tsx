import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Card, ListRow, Section, StateView, type Tone } from '../../components/ui';
import { dateLabel, humanize, money } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Read-only mirror of src/pages/Planos.tsx + useUserPlan. Checkout, payment and cancelation stay on the web.
type Sub = { plano_slug: string; status: string; em_trial: boolean | null; trial_fim: string | null; data_fim: string | null; cobranca_modalidade: string | null; planos?: { nome: string } | null };
type Plan = { id: string; nome: string; slug: string; descricao: string | null; valor: number; frequencia: string; ordem: number; trial_dias: number | null };
const statusInfo: Record<string, [string, Tone]> = { ativa: ['Ativa', 'success'], trial: ['Em teste', 'info'], cancelada: ['Cancelada', 'neutral'], expirada: ['Expirada', 'warning'], pendente: ['Pendente', 'warning'] };
const period = (f: string) => ({ mensal: 'mês', trimestral: '3 meses', semestral: '6 meses', anual: '12 meses' } as Record<string, string>)[f] ?? 'período';

export default function PlansScreen() {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const exempt = profile?.isPlatformAdmin ?? false;

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!userId) return undefined;
    if (exempt) return { sub: null, plans: [] as Plan[] };
    const [sub, plans] = await Promise.all([
      client.from('assinaturas_plano').select('plano_slug, status, em_trial, trial_fim, data_fim, cobranca_modalidade, planos!inner(nome)').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1),
      client.from('planos').select('id, nome, slug, descricao, valor, frequencia, ordem, trial_dias').eq('ativo', true).order('ordem'),
    ]);
    return { sub: ((must(sub) ?? [])[0] ?? null) as Sub | null, plans: (must(plans) ?? []) as Plan[] };
  }, [userId, exempt]);

  const sub = data?.sub;
  const active = !!sub && ['ativa', 'trial'].includes(sub.status);
  const trial = sub?.em_trial === true && sub.status === 'trial';
  const trialEnd = trial && sub?.trial_fim ? new Date(sub.trial_fim) : null;
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)) : 0;
  const [label, tone]: [string, Tone] = sub ? statusInfo[sub.status] ?? [humanize(sub.status), 'neutral'] : ['Sem plano ativo', 'warning'];
  const term = trialEnd ? `Teste até ${dateLabel(sub!.trial_fim)}${daysLeft ? ` · ${daysLeft} dia(s) restante(s)` : ''}`
    : sub?.cobranca_modalidade === 'pre_pago' && sub.data_fim ? `${sub.status === 'ativa' ? 'Acesso liberado até' : 'Período pago encerrado em'} ${dateLabel(sub.data_fim)}. Não renova automaticamente.`
    : sub?.cobranca_modalidade === 'recorrente' ? 'Renovação automática' : null;

  return <ModuleScreen moduleKey="planos" subtitle="Plano atual, status e período da assinatura." refreshing={refreshing} onRefresh={refresh}>
    {loading ? <StateView loading title="Carregando assinatura…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível confirmar a assinatura" message={error} onAction={reload} /> : exempt ? <StateView icon="shield-checkmark-outline" title="Acesso da plataforma" message="Contas da plataforma têm acesso independente de plano." /> : <>
      <Card style={styles.card}>
        <View style={styles.head}><Text style={styles.plan}>{sub?.planos?.nome ?? (active ? sub?.plano_slug : 'Nenhum plano')}</Text><Badge label={label} tone={tone} /></View>
        {term ? <Text style={styles.text}>{term}</Text> : null}
        {trial ? <Text style={styles.text}>Cancele antes do fim do teste para não ser cobrado; o acesso termina ao cancelar.</Text> : null}
        {!active ? <Text style={styles.text}>Escolha um plano para voltar a usar todos os recursos.</Text> : null}
      </Card>
      {data?.plans.length ? <Section title="Planos disponíveis">{data.plans.map(p => <ListRow key={p.id} title={p.nome} subtitle={p.descricao} meta={`${money(p.valor)} por ${period(p.frequencia)}${Number(p.trial_dias) > 0 ? ` · ${p.trial_dias} dias grátis no cartão` : ''}`}
        right={active && sub?.plano_slug === p.slug ? <Badge label="Plano atual" tone="primary" /> : undefined} />)}</Section> : <StateView icon="pricetags-outline" title="Nenhum plano disponível no momento" />}
      <Text style={styles.note}>Contratar, mudar de plano, pagar e cancelar são feitos na versão web, com o checkout seguro.</Text>
      <OpenOnWeb path="/planos" label="Gerenciar plano no navegador" />
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({ card: { gap: 8, marginTop: 8 }, head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, plan: { color: colors.ink, fontSize: 18, fontWeight: '800', flex: 1 }, text: { color: colors.muted, fontSize: 12, lineHeight: 18 }, note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginVertical: 14 } });
