import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Stat, StateView } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError, money } from '../../lib/format';
import { db, must, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Conta = { id: string; descricao: string | null; valor: number; valor_pago: number | null; desconto: number | null; acrescimo: number | null; status: string; data_vencimento: string; paciente_id: string };
type Paciente = { id: string; nome: string; telefone: string | null; email: string | null };
type Item = Conta & { paciente: Paciente | null; dias: number; saldo: number };
type Faixa = '1-30' | '31-60' | '61-90' | '90+';
type Indicador = 'todos' | 'atraso30' | 'comContato';

const LIMIT = 20000;
const PAGE = 60;
const FAIXAS: { id: Faixa; label: string; max: number }[] = [{ id: '1-30', label: '1 a 30 dias', max: 30 }, { id: '31-60', label: '31 a 60 dias', max: 60 }, { id: '61-90', label: '61 a 90 dias', max: 90 }, { id: '90+', label: 'Mais de 90 dias', max: Infinity }];
const faixaOf = (dias: number) => (dias >= 1 ? FAIXAS.find(f => dias <= f.max)!.id : null);
const REASONS: Record<string, string> = {
  sem_saldo: 'sem saldo pendente', fora_da_regua: 'fora da data prevista pela régua', ja_enviado: 'já enviados nesta etapa', falha_ao_enfileirar_email: 'falha ao enfileirar e-mail',
  falha_ao_reabrir_email: 'falha ao retomar e-mail na fila', resultado_whatsapp_indeterminado: 'resultado do WhatsApp indeterminado; confira a fila antes de reenviar', sem_contato: 'sem contato disponível',
  falha_whatsapp_sem_email_alternativo: 'falha no WhatsApp sem e-mail alternativo', dry_run: 'simulação, sem envio',
};
const firstName = (nome?: string | null) => (nome || 'paciente').trim().split(' ')[0] || 'paciente';
const message = (nome: string, valor: string, dias: number) => `Olá, ${nome}! Identificamos uma pendência de ${valor} vencida há ${dias} dia(s). Podemos ajudar a regularizar o pagamento?`;
/** Same wa.me rule as src/lib/whatsapp.ts. */
function whatsapp(telefone: string | null | undefined, text: string) {
  const d = (telefone ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}?text=${encodeURIComponent(text)}`;
}
async function fetchAll<T>(build: () => Db, size = 1000): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < LIMIT) {
    const batch = (must<T[]>(await build().range(rows.length, rows.length + size - 1)) ?? []);
    rows.push(...batch);
    if (batch.length < size) break;
  }
  return rows;
}

export default function DelinquencyScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [indicador, setIndicador] = useState<Indicador>('todos');
  const [faixa, setFaixa] = useState<Faixa | 'todas'>('todas');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [sending, setSending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const today = clinicDate();
    const contas = await fetchAll<Conta>(() => client.from('lancamentos').select('id, descricao, valor, valor_pago, desconto, acrescimo, status, data_vencimento, paciente_id')
      .eq('clinica_id', clinicId).eq('tipo', 'receita').in('status', ['pendente', 'parcial', 'atrasado']).lt('data_vencimento', today).not('paciente_id', 'is', null)
      .order('data_vencimento', { ascending: true }).order('id', { ascending: true }), 500);
    const ids = [...new Set(contas.map(c => c.paciente_id))];
    const people = new Map<string, Paciente>();
    for (let i = 0; i < ids.length; i += 500) for (const p of must<Paciente[]>(await client.rpc('buscar_pacientes_resumo_financeiro', { p_ids: ids.slice(i, i + 500), p_termo: null, p_limite: 500 })) ?? []) people.set(p.id, p);
    const todayUtc = Date.parse(`${today}T00:00:00Z`);
    return contas.map<Item>(c => {
      const due = Date.parse(`${c.data_vencimento}T00:00:00Z`);
      return { ...c, paciente: people.get(c.paciente_id) ?? null, dias: Number.isFinite(due) ? Math.max(0, Math.floor((todayUtc - due) / 86400000)) : 0, saldo: Math.max(0, Number(c.valor || 0) - Number(c.desconto || 0) + Number(c.acrescimo || 0) - Number(c.valor_pago || 0)) };
    });
  }, [clinicId]);

  const items = data ?? [];
  const contact = (i: Item) => !!(i.paciente?.telefone || i.paciente?.email);
  const comContato = items.filter(contact);
  const acima30 = items.filter(i => i.dias > 30).length;
  const total = items.reduce((a, i) => a + i.saldo, 0);
  const term = search.trim().toLowerCase();
  const filtered = items.filter(i => (indicador !== 'atraso30' || i.dias > 30) && (indicador !== 'comContato' || contact(i)) && (faixa === 'todas' || faixaOf(i.dias) === faixa) && (!term || (i.paciente?.nome || '').toLowerCase().includes(term)));
  // Cent-exact totals per bucket, as resumoPorFaixa does.
  const buckets = FAIXAS.map(f => { const list = items.filter(i => faixaOf(i.dias) === f.id); return { ...f, count: list.length, total: list.reduce((a, i) => a + Math.round(i.saldo * 100), 0) / 100 }; });
  const urgent = items.reduce<Item | null>((best, i) => (!best || i.dias > best.dias || (i.dias === best.dias && i.saldo > best.saldo) ? i : best), null);
  const pickIndicador = (k: Indicador) => { setIndicador(indicador === k && k !== 'todos' ? 'todos' : k); setShown(PAGE); };

  function runReminders() {
    if (!comContato.length) return setFeedback({ message: 'Nenhum lançamento vencido tem telefone ou e-mail cadastrado.', error: true });
    Alert.alert('Processar cobranças vencidas', `Processar cobranças dos ${comContato.length} lançamentos vencidos com telefone ou e-mail? A régua pode pular itens fora da data prevista ou já enviados.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Processar', onPress: () => void (async () => {
        const batches = Array.from({ length: Math.ceil(comContato.length / 500) }, (_, i) => comContato.slice(i * 500, (i + 1) * 500).map(c => c.id));
        let processed = 0; let whats = 0; let emails = 0; let skipped = 0; let current = 0;
        const reasons: Record<string, number> = {};
        setFeedback(null);
        try {
          for (const [index, ids] of batches.entries()) {
            current = index + 1;
            setSending(`Processando ${current}/${batches.length}…`);
            const { data: resp, error: fnError } = await db.functions.invoke('delinquency-whatsapp-reminder', { body: { lancamento_ids: ids } });
            if (fnError) throw fnError;
            processed += Number(resp?.processed || 0);
            const results: { sent?: boolean; channel?: string; reason?: string }[] = Array.isArray(resp?.results) ? resp.results : [];
            whats += results.filter(r => r.sent && r.channel === 'whatsapp').length;
            emails += results.filter(r => r.sent && ['email_queue', 'email_queue_retry'].includes(r.channel ?? '')).length;
            for (const r of results.filter(x => !x.sent)) { skipped++; const k = r.reason || 'motivo_desconhecido'; reasons[k] = (reasons[k] || 0) + 1; }
          }
          const detail = Object.entries(reasons).map(([k, n]) => `${n} ${REASONS[k] || k.replace(/_/g, ' ')}`).join(' · ');
          setFeedback({ message: `Régua concluída. Processados: ${processed}. WhatsApp: ${whats} · e-mails enfileirados: ${emails} · não enviados: ${skipped}${detail ? ` (${detail})` : ''}` });
          reload();
        } catch (err) {
          setFeedback({ message: current > 1 ? `Falha no lote ${current} de ${batches.length}. Processados ${processed} até aqui; atualize a lista antes de tentar novamente.` : friendlyError(err, 'Falha ao disparar cobrança.'), error: true });
        } finally { setSending(null); }
      })() },
    ]);
  }

  const actions = (i: Item) => {
    const link = whatsapp(i.paciente?.telefone, message(firstName(i.paciente?.nome), money(i.saldo), i.dias));
    const phone = (i.paciente?.telefone ?? '').replace(/\D/g, '');
    return <View style={styles.actions}>
      {link ? <Button variant="secondary" icon="logo-whatsapp" label="WhatsApp" onPress={() => void Linking.openURL(link)} /> : <Text style={styles.muted}>Sem telefone válido</Text>}
      {phone.length >= 10 ? <Button variant="ghost" icon="call-outline" label="Ligar" onPress={() => void Linking.openURL(`tel:${phone}`)} /> : null}
      {i.paciente?.email ? <Button variant="ghost" icon="mail-outline" label="E-mail" onPress={() => void Linking.openURL(`mailto:${i.paciente?.email}`)} /> : null}
    </View>;
  };

  return <ModuleScreen moduleKey="inadimplentes" title="Cobrança de inadimplentes" subtitle={data ? `${items.length} pendência(s) vencida(s) · ${comContato.length} com contato para cobrança` : 'Pendências vencidas vinculadas a pacientes.'} refreshing={refreshing} onRefresh={refresh}
    action={<Button icon="send-outline" label={sending ?? 'Régua'} loading={!!sending} disabled={!!sending || !!error || !comContato.length} onPress={runReminders} />}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando pendências…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as pendências" message={error} onAction={reload} /> : !items.length ? <>
      <StateView icon="checkmark-done-outline" title="Nenhuma pendência vencida" message="Não há contas vencidas vinculadas a pacientes. Consulte todas as contas a receber para acompanhar os próximos vencimentos." actionLabel="Abrir contas a receber" onAction={() => router.push('/modules/contas' as Href)} />
    </> : <>
      {items.length >= LIMIT ? <Text accessibilityRole="alert" style={styles.warn}>A busca atingiu o limite de {LIMIT.toLocaleString('pt-BR')} lançamentos. Os totais e a lista podem estar incompletos.</Text> : null}
      <View style={styles.stats}>
        <Stat label="Pendências vencidas" value={items.length} onPress={() => pickIndicador('todos')} />
        <Stat label={acima30 ? `Saldo em aberto · ${acima30} com +30 dias` : 'Saldo em aberto · nenhum acima de 30 dias'} value={money(total)} tone="danger" onPress={() => pickIndicador('atraso30')} />
        <Stat label={`Com contato · ${items.length - comContato.length} sem telefone ou e-mail`} value={comContato.length} tone="success" onPress={() => pickIndicador('comContato')} />
      </View>
      {items.length > comContato.length ? <Text style={styles.note}>{items.length - comContato.length} cobrança(s) estão fora da régua por falta de telefone e e-mail. Atualize o contato no cadastro do paciente para permitir o envio.</Text> : null}
      {urgent ? <Card style={styles.urgent}>
        <Text style={styles.kicker}>Pendência mais urgente</Text>
        <Text style={styles.urgentName}>{urgent.paciente?.nome || '—'}</Text>
        <Text style={styles.muted}>Venc. {dateLabel(urgent.data_vencimento)} · <Text style={styles.late}>{urgent.dias} dia(s) de atraso</Text> · {money(urgent.saldo)}</Text>
        {actions(urgent)}
      </Card> : null}
      <Chips label="Faixa de atraso" options={[{ value: 'todas', label: 'Todas' }, ...buckets.map(b => ({ value: b.id, label: `${b.label} · ${b.count} · ${money(b.total)}` }))]} value={faixa} onChange={v => { setFaixa(v as Faixa | 'todas'); setShown(PAGE); }} />
      <Field label="Buscar paciente" value={search} onChangeText={v => { setSearch(v); setShown(PAGE); }} placeholder="Nome do paciente" />
      {!filtered.length ? <StateView icon="filter-outline" title="Nenhuma pendência corresponde aos filtros" actionLabel="Limpar filtros" onAction={() => { setIndicador('todos'); setFaixa('todas'); setSearch(''); }} /> :
        <Section title={`Pendências · ${filtered.length} de ${items.length}`}>{filtered.slice(0, shown).map(i => <View key={i.id} style={styles.item}>
          <ListRow icon="alert-circle-outline" tone={i.dias > 30 ? 'danger' : 'warning'} title={i.paciente?.nome || '—'} subtitle={i.descricao}
            meta={[`Venc. ${dateLabel(i.data_vencimento)}`, FAIXAS.find(f => f.id === faixaOf(i.dias))?.label, i.paciente?.telefone || i.paciente?.email || 'sem contato'].filter(Boolean).join(' · ')}
            right={<View style={styles.right}><Text style={styles.value}>{money(i.saldo)}{i.status === 'parcial' ? ' (saldo)' : ''}</Text><Badge label={`${i.dias} dias`} tone={i.dias > 30 ? 'danger' : 'warning'} /></View>} />
          {actions(i)}
        </View>)}{filtered.length > shown ? <Button variant="secondary" label={`Mostrar mais (${filtered.length - shown} restantes)`} onPress={() => setShown(shown + PAGE)} /> : null}</Section>}
      <Section title="No navegador">
        <Text style={styles.note}>A exportação da lista para cobrança manual (planilha com contatos) fica no navegador, com a confirmação de uso restrito à equipe financeira.</Text>
        <OpenOnWeb path="/cobranca-inadimplentes" label="Exportar lista no navegador" />
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 10 },
  urgent: { borderColor: colors.primary, marginBottom: 14 }, kicker: { color: colors.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, urgentName: { color: colors.ink, fontSize: 17, fontWeight: '800', marginVertical: 4 },
  muted: { color: colors.muted, fontSize: 12 }, late: { color: colors.danger, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8 }, item: { marginBottom: 4 },
  right: { alignItems: 'flex-end', gap: 4 }, value: { color: colors.ink, fontSize: 13, fontWeight: '800' },
});
