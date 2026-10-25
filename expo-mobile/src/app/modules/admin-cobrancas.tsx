import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Field, ListRow, Section, Segmented, Stat, StateView } from '../../components/ui';
import { dateLabel, money } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Subscription = { clinica_id: string; clinica_nome: string; dono_email: string | null; assinatura_id: string | null; assinatura_status: string | null; em_trial: boolean | null; plano_nome: string | null; plano_valor: number | null; mp_status: string | null; proximo_pagamento: string | null; vencida: boolean };
type Webhook = { id: string; event_id: string | null; event_type: string; data_id: string | null; processado: boolean | null; tentativas: number | null; erro_mensagem: string | null; created_at: string; repeticoes?: number | null; sinal_ordem?: 'repetido' | 'fora_de_ordem' | null };
type Overview = { generated_at: string; metrics: { mrr: number; ativas: number; trials: number; vencidas: number; sem_assinatura: number; webhooks_pendentes: number; webhooks_falha_24h: number }; subscriptions: Subscription[]; webhooks: Webhook[] };
type Invoice = { id: string; clinic_name: string; owner_email: string | null; mp_authorized_payment_id: string; invoice_status: string; payment_status: string | null; payment_status_detail: string | null; amount: number | null; currency_id: string | null; date_created: string | null; debit_date: string | null; retry_attempt: number | null };
type Attempt = { id: string; origem: string; status: string; detalhe: string | null; valor: number | null; criado_em: string | null; clinica_nome: string | null; dono_email: string | null; divergente: boolean };
type Tab = 'clinicas' | 'faturas' | 'checkout' | 'webhooks';

// Same maps as src/lib/subscriptionBillingHistory.ts on the web.
const TIPOS: Record<string, string> = { cartao_assinatura: 'Assinatura no cartão', pix_periodo: 'Pix (período)', fatura_recorrente: 'Fatura recorrente' };
const ESTADOS: Record<string, string> = { ativa: 'Ativa', cancelada: 'Cancelada', pausada: 'Pausada', pendente: 'Pendente', criando: 'Gerando', aguardando_pagamento: 'Aguardando pagamento', em_processamento: 'Em processamento', pago: 'Pago', recusado: 'Recusado', cancelado: 'Cancelado', expirado: 'Expirado', estornado: 'Estornado', erro: 'Não gerado', approved: 'Pago', authorized: 'Autorizado', pending: 'Pendente', in_process: 'Em processamento', rejected: 'Recusado', cancelled: 'Cancelado', refunded: 'Estornado', charged_back: 'Contestado', in_mediation: 'Em disputa', scheduled: 'Agendada', processed: 'Processada' };
const DETALHES: Record<string, string> = { recusado: 'Cartão recusado', dados_invalidos: 'Dados do cartão inválidos', falha_comunicacao: 'Sem resposta do Mercado Pago', valor_divergente: 'Valor pago diferente do cobrado' };
const filters = [{ value: 'all', label: 'Todas' }, { value: 'ativa', label: 'Ativas' }, { value: 'trial', label: 'Em teste' }, { value: 'vencida', label: 'Vencidas' }, { value: 'sem_assinatura', label: 'Sem assinatura' }];

function matches(s: Subscription, status: string) {
  if (status === 'all') return true;
  if (status === 'vencida') return s.vencida;
  if (status === 'sem_assinatura') return !s.assinatura_id;
  if (status === 'ativa') return s.assinatura_status === 'ativa' && !s.em_trial && !s.vencida;
  if (status === 'trial') return (Boolean(s.em_trial) || s.assinatura_status === 'trial') && !s.vencida;
  return s.assinatura_status === status;
}

export default function AdminBillingScreen() {
  const [tab, setTab] = useState<Tab>('clinicas');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('all');

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [overview, invoices, attempts, recs] = await Promise.all([
      client.rpc('platform_billing_overview'),
      client.rpc('platform_subscription_invoice_history', { p_limit: 50 }),
      client.rpc('platform_checkout_attempts', { p_limit: 50 }),
      client.rpc('platform_reconciliacoes_cobranca', { p_limit: 20 }),
    ]);
    return { overview: must<Overview>(overview), invoices: (must(invoices) ?? []) as Invoice[], attempts: (must(attempts) ?? []) as Attempt[], recs: (must(recs) ?? []) as { id: string; justificativa: string; status_anterior: string | null; status_novo: string | null; autor_email: string | null; criado_em: string | null }[] };
  }, []);

  const m = data?.overview.metrics;
  const term = busca.trim().toLocaleLowerCase('pt-BR');
  const list = (data?.overview.subscriptions ?? []).filter(s => matches(s, status) && (!term || `${s.clinica_nome} ${s.dono_email ?? ''} ${s.plano_nome ?? ''}`.toLocaleLowerCase('pt-BR').includes(term)));
  const drill = (key: string) => { setTab('clinicas'); setStatus(status === key ? 'all' : key); };

  return <ModuleScreen moduleKey="admin-cobrancas" subtitle={m ? `${m.ativas} assinaturas pagas ativas · ${m.vencidas} vencidas · ${m.sem_assinatura} sem assinatura · dados de ${dateLabel(data?.overview.generated_at)}` : 'Assinaturas, vencimentos e processamento do Mercado Pago.'} refreshing={refreshing} onRefresh={refresh}>
    {loading ? <StateView loading title="Carregando cobranças…" /> : error || !data ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error ?? undefined} onAction={reload} /> : <>
      <Card style={styles.mrr}><Text style={styles.mrrLabel}>MRR estimado</Text><Text style={styles.mrrValue}>{money(m?.mrr)}</Text><Text style={styles.mrrLabel}>assinaturas pagas e válidas</Text></Card>
      <View style={styles.stats}>
        <Stat label="Assinaturas pagas ativas" value={m?.ativas ?? 0} tone="success" onPress={() => drill('ativa')} />
        <Stat label="Em período de teste" value={m?.trials ?? 0} tone="info" onPress={() => drill('trial')} />
        <Stat label="Vencidas" value={m?.vencidas ?? 0} tone="warning" onPress={() => drill('vencida')} />
        <Stat label="Sem assinatura" value={m?.sem_assinatura ?? 0} tone="neutral" onPress={() => drill('sem_assinatura')} />
      </View>
      {m?.webhooks_pendentes || m?.webhooks_falha_24h ? <Card style={styles.alert}><Text style={styles.alertTitle}>Processamento financeiro requer atenção</Text><Text style={styles.copy}>{m.webhooks_pendentes} pendente(s) · {m.webhooks_falha_24h} falha(s) nas últimas 24h</Text></Card> : null}
      <View style={styles.actions}><Button variant="secondary" icon="time-outline" label="Histórico financeiro" onPress={() => router.push('/modules/admin-historico-financeiro')} /></View>
      <Segmented options={[{ value: 'clinicas', label: 'Clínicas' }, { value: 'faturas', label: 'Faturas' }, { value: 'checkout', label: 'Checkout' }, { value: 'webhooks', label: 'Webhooks' }]} value={tab} onChange={setTab} />

      {tab === 'clinicas' ? <Section title="Carteira de clientes">
        <Text style={styles.copy}>{list.length} de {data.overview.subscriptions.length} clínicas. Estado local da assinatura e vínculo com o Mercado Pago; expiradas não entram no total ativo nem no MRR.</Text>
        <Field label="Buscar" value={busca} onChangeText={setBusca} placeholder="Clínica, responsável ou plano" />
        <Chips options={filters} value={status} onChange={setStatus} />
        {!list.length ? <StateView icon="search-outline" title="Nenhuma clínica encontrada" actionLabel="Limpar filtros" onAction={() => { setBusca(''); setStatus('all'); }} /> : list.map(s => <ListRow key={s.clinica_id} title={s.clinica_nome} subtitle={`${s.dono_email || 'Sem e-mail do responsável'} · ${s.plano_nome || 'Sem plano'} ${money(s.plano_valor)}/mês`}
          meta={`Mercado Pago: ${s.mp_status || 'não vinculado'} · Próximo pagamento: ${s.proximo_pagamento ? dateLabel(s.proximo_pagamento) : '—'}`} right={<Badge label={s.vencida ? 'Vencida' : s.assinatura_status || 'Sem assinatura'} tone={s.vencida ? 'danger' : 'neutral'} />} />)}
      </Section> : null}

      {tab === 'faturas' ? <Section title="Faturas recorrentes recentes">
        <Text style={styles.copy}>Histórico das faturas do Mercado Pago, com status da fatura e do pagamento separados.</Text>
        {!data.invoices.length ? <StateView icon="receipt-outline" title="Nenhuma fatura recorrente registrada ainda." /> : data.invoices.map(i => <ListRow key={i.id} title={i.clinic_name}
          subtitle={`Fatura: ${i.invoice_status} · Pagamento: ${i.payment_status || 'sem pagamento vinculado'}${i.payment_status_detail ? ` (${i.payment_status_detail})` : ''}`}
          meta={`${i.date_created || i.debit_date ? dateLabel(i.date_created || i.debit_date) : 'Data indisponível'}${i.retry_attempt ? ` · tentativa ${i.retry_attempt}` : ''}`}
          right={<Badge label={i.amount === null ? 'Valor indisponível' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: i.currency_id || 'BRL' }).format(i.amount)} tone={i.payment_status === 'approved' ? 'success' : i.payment_status ? 'danger' : 'neutral'} />} />)}
      </Section> : null}

      {tab === 'checkout' ? <Section title="Tentativas de checkout">
        <Text style={styles.copy}>Cada tentativa no cartão e pedido Pix da assinatura, com o estado final. Não há dados de cartão nem do provedor.</Text>
        {!data.attempts.length ? <StateView icon="card-outline" title="Nenhuma tentativa de checkout registrada." /> : data.attempts.map(a => <ListRow key={`${a.origem}-${a.id}`} title={a.clinica_nome || a.dono_email || 'Conta sem clínica'}
          subtitle={`${TIPOS[a.origem] ?? a.origem} · ${a.criado_em ? dateLabel(a.criado_em) : 'Data indisponível'}${a.detalhe ? ` · ${DETALHES[a.detalhe] ?? a.detalhe}` : ''}`}
          meta={`${ESTADOS[a.status] ?? a.status} · ${a.valor === null ? '—' : money(a.valor)}`} right={a.divergente ? <Badge label="Divergente" tone="danger" /> : null} />)}
        {data.attempts.some(a => a.divergente) ? <Card style={styles.handoff}><Text style={styles.copy}>A reconciliação de cobranças divergentes ajusta registros financeiros e exige justificativa auditada; faça pelo navegador.</Text><OpenOnWeb path="/admin/cobrancas" label="Reconciliar no navegador" /></Card> : null}
        {data.recs.length ? <Section title="Reconciliações registradas">{data.recs.map(r => <Text key={r.id} style={styles.copy}>{r.criado_em ? dateLabel(r.criado_em) : '—'} · {r.autor_email || 'administrador'} · {r.status_anterior} → {r.status_novo} · {r.justificativa}</Text>)}</Section> : null}
      </Section> : null}

      {tab === 'webhooks' ? <Section title="Webhooks recentes">
        <Text style={styles.copy}>Metadados operacionais; os payloads financeiros não são expostos. A lista mostra até 30 dos 100 eventos carregados.</Text>
        {!data.overview.webhooks.length ? <StateView icon="git-network-outline" title="Nenhum webhook registrado." /> : data.overview.webhooks.slice(0, 30).map(w => <ListRow key={w.id} title={w.event_type}
          subtitle={`Evento ${w.event_id || w.data_id || 'sem identificador'} · ${dateLabel(w.created_at)}${w.erro_mensagem ? ` · ${w.erro_mensagem}` : ''}`}
          meta={[`${w.tentativas || 0} tentativa(s)`, w.repeticoes ? `Repetido ${w.repeticoes}×` : null, w.sinal_ordem === 'fora_de_ordem' ? 'Fora de ordem' : w.sinal_ordem === 'repetido' ? 'Sem efeito' : null].filter(Boolean).join(' · ')}
          right={<Badge label={w.processado ? 'Processado' : 'Pendente'} tone={w.processado ? 'success' : 'danger'} />} />)}
      </Section> : null}
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  mrr: { backgroundColor: colors.primary, borderColor: colors.primary, marginBottom: 10 }, mrrLabel: { color: '#FFFFFF', opacity: 0.85, fontSize: 11 }, mrrValue: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginVertical: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, actions: { flexDirection: 'row', marginVertical: 12 },
  alert: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft, marginTop: 10 }, alertTitle: { color: colors.danger, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  copy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 10 }, handoff: { marginTop: 12 },
});
