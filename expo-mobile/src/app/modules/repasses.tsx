import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError, money, parseDateBR, parseMoney } from '../../lib/format';
import { db, must, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type TipoRepasse = 'percentual' | 'fixo';
type Medico = { id: string; nome: string | null; crm: string; tipo_repasse: TipoRepasse | null; percentual_repasse: number | null; valor_repasse_fixo: number | null };
type Repasse = { id: string; lancamento_id: string; valor_base: number; valor_repasse: number; percentual: number; tipo_calculo: TipoRepasse; valor_configurado: number | null; status: string; lancamento_pagamento_id: string | null; lancamentos: { status: string } | null; medicos: { nome: string | null; crm: string } | null };
type Filtro = 'todos' | 'pendente' | 'aprovado' | 'pago' | 'aberto';
type PayForm = { repasse: Repasse; forma: string; data: string; obs: string };
type RuleForm = { medico: Medico; tipo: TipoRepasse; valor: string };

const LIMIT = 20000;
const FORMAS = [{ value: 'transferencia', label: 'Transferência' }, { value: 'pix', label: 'PIX' }, { value: 'dinheiro', label: 'Dinheiro' }, { value: 'credito', label: 'Cartão de crédito' }, { value: 'debito', label: 'Cartão de débito' }, { value: 'cheque', label: 'Cheque' }];
const STATUS: Record<string, { label: string; tone: Tone }> = { pago: { label: 'Pago', tone: 'success' }, aprovado: { label: 'Aprovado', tone: 'primary' }, pendente: { label: 'Pendente', tone: 'warning' }, cancelado: { label: 'Cancelado', tone: 'neutral' } };
// Same rules as src/lib/repasseWorkflow.ts.
const originPaid = (s?: string | null) => s === 'pago';
const rule = (tipo: string | null | undefined, valor: number | null | undefined) => tipo === 'fixo' ? `${money(Number(valor) || 0)} por atendimento` : `${(Number(valor) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da receita`;
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const monthLabel = (m: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
async function fetchAll<T>(build: () => Db): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < LIMIT) {
    const batch = (must<T[]>(await build().range(rows.length, rows.length + 999)) ?? []);
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

export default function TransfersScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const thisMonth = clinicDate().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [pay, setPay] = useState<PayForm | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [medicos, historico, repasses] = await Promise.all([
      client.rpc('listar_medicos_repasse_equipe'),
      client.rpc('historico_regras_repasse', { p_limite: 500 }),
      fetchAll<Repasse>(() => client.from('repasses_medicos').select('*,medicos(nome,crm),lancamentos!repasses_medicos_lancamento_id_fkey(status)')
        .eq('clinica_id', clinicId).gte('competencia', `${month}-01`).lt('competencia', `${shiftMonth(month, 1)}-01`).order('created_at').order('id')),
    ]);
    const last = new Map<string, { alterado_por_nome: string | null; alterado_em: string }>();
    for (const h of (must<{ medico_id: string; alterado_por_nome: string | null; alterado_em: string }[]>(historico) ?? [])) if (!last.has(h.medico_id)) last.set(h.medico_id, h);
    return { medicos: (must<Medico[]>(medicos) ?? []), last, repasses };
  }, [clinicId, month]);

  const repasses = data?.repasses ?? [];
  const valid = (r: Repasse) => r.status === 'pago' || (r.status !== 'cancelado' && originPaid(r.lancamentos?.status));
  const sum = (list: Repasse[]) => list.reduce((s, r) => s + Number(r.valor_repasse), 0);
  const devido = sum(repasses.filter(valid));
  const pago = sum(repasses.filter(r => r.status === 'pago'));
  const pendente = sum(repasses.filter(r => r.status === 'pendente' && valid(r)));
  const aprovado = sum(repasses.filter(r => r.status === 'aprovado' && valid(r)));
  const emAberto = Math.max(0, devido - pago);
  const estornados = repasses.filter(r => r.status !== 'cancelado' && !originPaid(r.lancamentos?.status));
  const filtered = repasses.filter(r => filtro === 'todos' || (filtro === 'aberto' ? r.status === 'pendente' || r.status === 'aprovado' : r.status === filtro));
  const pick = (k: Filtro) => setFiltro(filtro === k ? 'todos' : k);

  async function reconcile() {
    setBusy('gerar'); setFeedback(null);
    try {
      const n = must(await db.rpc('gerar_repasses_medicos', { p_competencia: `${month}-01` }));
      setFeedback({ message: n ? `${n} novo(s) repasse(s) conciliado(s).` : 'Não há novos recebimentos elegíveis nesta competência.' });
      reload();
    } catch (err) { setFeedback({ message: `Não foi possível conciliar os recebimentos. ${friendlyError(err)}`, error: true }); } finally { setBusy(null); }
  }

  async function advance(r: Repasse, status: 'aprovado' | 'pago') {
    if (!clinicId) return;
    const today = clinicDate();
    const paidOn = pay ? parseDateBR(pay.data) : null;
    if (status === 'pago' && (!paidOn || paidOn > today)) return setFeedback({ message: 'Informe uma data de pagamento válida (DD/MM/AAAA), igual ou anterior a hoje.', error: true });
    setBusy(r.id); setFeedback(null);
    try {
      // Re-check the source revenue right before advancing, as the web does.
      const origem = must<{ status: string } | null>(await db.from('lancamentos').select('status').eq('id', r.lancamento_id).eq('clinica_id', clinicId).maybeSingle());
      if (!originPaid(origem?.status)) throw new Error('A receita de origem foi estornada ou deixou de estar quitada. O repasse não pode avançar.');
      if (status === 'pago') {
        const res = must<{ success?: boolean; error?: string; ja_registrado?: boolean }>(await db.rpc('registrar_pagamento_repasse_medico', { p_repasse_id: r.id, p_forma_pagamento: pay?.forma, p_data_pagamento: paidOn, p_observacoes: pay?.obs.trim() || null }));
        if (!res?.success) throw new Error(res?.error || 'O pagamento não foi registrado.');
        setPay(null);
        setFeedback({ message: res.ja_registrado ? 'O pagamento deste repasse já estava registrado.' : 'Pagamento registrado como despesa no fluxo financeiro.' });
      } else {
        const res = must<{ success?: boolean; error?: string }>(await db.rpc('aprovar_repasse_medico', { p_repasse_id: r.id }));
        if (!res?.success) throw new Error(res?.error || 'Este repasse mudou de status. Atualize a lista antes de continuar.');
        setFeedback({ message: 'Repasse aprovado.' });
      }
    } catch (err) { setFeedback({ message: `Não foi possível atualizar o repasse. ${friendlyError(err)}`, error: true }); } finally { setBusy(null); reload(); }
  }

  function saveRule() {
    if (!ruleForm) return;
    const { medico, tipo } = ruleForm;
    const n = parseMoney(ruleForm.valor);
    if (!Number.isFinite(n) || n < 0 || (tipo === 'percentual' && n > 100)) return setFeedback({ message: tipo === 'percentual' ? 'Informe um percentual entre 0 e 100, com até duas casas decimais.' : 'Informe um valor fixo válido, com até duas casas decimais.', error: true });
    const tipoAtual = medico.tipo_repasse || 'percentual';
    Alert.alert(`Alterar regra de repasse de ${medico.nome || medico.crm}?`, `De ${rule(tipoAtual, tipoAtual === 'fixo' ? medico.valor_repasse_fixo : medico.percentual_repasse)} para ${rule(tipo, n)}. A nova regra vale para as próximas conciliações; repasses já gerados não mudam. Seu usuário e a data ficarão registrados.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Confirmar alteração', onPress: () => void (async () => {
        setBusy(medico.id);
        try {
          const res = must<{ alterado?: boolean }>(await db.rpc('configurar_repasse_medico', { p_medico_id: medico.id, p_tipo: tipo, p_valor: n, p_confirmado: true }));
          setRuleForm(null);
          setFeedback({ message: res?.alterado === false ? 'A regra informada já estava em vigor.' : `Regra de repasse de ${medico.nome || medico.crm} atualizada.` });
          reload();
        } catch (err) { setFeedback({ message: `Não foi possível salvar a regra de repasse. ${friendlyError(err)}`, error: true }); } finally { setBusy(null); }
      })() },
    ]);
  }

  return <ModuleScreen moduleKey="repasses" subtitle={repasses.length ? `${repasses.length} repasse(s) na competência · ${money(emAberto)} em aberto` : 'Concilie honorários sobre receitas quitadas.'} refreshing={refreshing} onRefresh={refresh}
    action={<Button icon="play" label="Conciliar" loading={busy === 'gerar'} disabled={!!busy} onPress={() => void reconcile()} />}>
    <View style={styles.monthNav}>
      <Pressable accessibilityRole="button" accessibilityLabel="Competência anterior" hitSlop={6} onPress={() => setMonth(shiftMonth(month, -1))} style={styles.navBtn}><Ionicons name="chevron-back" size={20} color={colors.primary} /></Pressable>
      <Text accessibilityRole="header" style={styles.monthText}>Competência {monthLabel(month)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Próxima competência" hitSlop={6} onPress={() => setMonth(shiftMonth(month, 1))} style={styles.navBtn}><Ionicons name="chevron-forward" size={20} color={colors.primary} /></Pressable>
    </View>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {pay ? <Card style={styles.form}>
      <Text style={styles.formTitle}>Registrar pagamento do repasse</Text>
      <Text style={styles.caption}>Confirme que o pagamento de {money(pay.repasse.valor_repasse)} para {pay.repasse.medicos?.nome || pay.repasse.medicos?.crm || 'o médico'} já foi realizado. O EloLab registrará a saída no Fluxo de Caixa; nenhuma transferência será iniciada pelo sistema.</Text>
      <Chips label="Forma de pagamento" options={FORMAS} value={pay.forma} onChange={forma => setPay({ ...pay, forma })} />
      <Field label="Data em que foi pago" value={pay.data} onChangeText={d => setPay({ ...pay, data: d })} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" />
      <Field label="Referência ou observação (opcional)" value={pay.obs} onChangeText={obs => setPay({ ...pay, obs })} placeholder="Ex.: transferência realizada em 06/10, comprovante 12345" multiline />
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={!!busy} onPress={() => setPay(null)} /><Button icon="checkmark" label="Confirmar pagamento realizado" loading={busy === pay.repasse.id} onPress={() => void advance(pay.repasse, 'pago')} /></View>
    </Card> : null}
    {loading ? <StateView loading title="Carregando repasses…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os repasses" message={error} onAction={reload} /> : <>
      {estornados.length ? <Text accessibilityRole="alert" style={styles.danger}>{estornados.length} repasse(s) estão vinculados a receitas que não aparecem mais como quitadas. Aprovação e pagamento ficam bloqueados; revise os casos que já constam como pagos.</Text> : null}
      {repasses.length >= LIMIT ? <Text accessibilityRole="alert" style={styles.warn}>A lista atingiu o limite de {LIMIT.toLocaleString('pt-BR')} registros. Os totais podem não incluir todos os repasses.</Text> : null}
      <View style={styles.stats}>
        <Stat label="Em aberto · pendente + aprovado" value={money(emAberto)} onPress={() => pick('aberto')} />
        <Stat label="Pendente · aguardando aprovação" value={money(pendente)} tone="warning" onPress={() => pick('pendente')} />
        <Stat label="Aprovado · aguardando pagamento" value={money(aprovado)} onPress={() => pick('aprovado')} />
        <Stat label="Pago na competência" value={money(pago)} tone="success" onPress={() => pick('pago')} />
      </View>
      <Section title={`Fechamento · ${filtered.length} de ${repasses.length}`}>
        <Text style={styles.caption}>O pagamento registrado gera uma despesa no Fluxo de Caixa. A transferência ao médico é realizada fora do EloLab.</Text>
        {!repasses.length ? <StateView icon="cash-outline" title="Nenhum repasse nesta competência" message="Concilie os recebimentos para gerar os itens elegíveis." /> : !filtered.length ? <StateView icon="filter-outline" title="Nenhum repasse corresponde ao filtro selecionado" actionLabel="Limpar filtro" onAction={() => setFiltro('todos')} /> :
          filtered.map(r => {
            const s = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as Tone };
            const blocked = r.status !== 'pago' && r.status !== 'cancelado' && !originPaid(r.lancamentos?.status);
            return <View key={r.id} style={styles.item}>
              <ListRow icon="person-outline" tone={s.tone} title={r.medicos?.nome || r.medicos?.crm || 'Médico'} subtitle={`Base ${money(r.valor_base)} · ${r.tipo_calculo === 'fixo' ? `${money(r.valor_configurado || r.valor_repasse)} fixo` : `${r.percentual}%`}`}
                meta={blocked ? 'Receita estornada' : r.status === 'pago' && !r.lancamento_pagamento_id ? 'Pago antes do vínculo automático' : null}
                right={<View style={styles.right}><Text style={styles.value}>{money(r.valor_repasse)}</Text><Badge label={s.label} tone={s.tone} /></View>} />
              <View style={styles.actions}>
                {r.status === 'pendente' && !blocked ? <Button label="Aprovar" disabled={!!busy} loading={busy === r.id} onPress={() => void advance(r, 'aprovado')} /> : null}
                {r.status === 'aprovado' && !blocked ? <Button icon="checkmark-circle-outline" label="Registrar pagamento" disabled={!!busy} onPress={() => { setFeedback(null); setPay({ repasse: r, forma: 'transferencia', data: dateLabel(clinicDate()), obs: '' }); }} /> : null}
              </View>
            </View>;
          })}
      </Section>
      <Section title="Regra por médico">
        <Text style={styles.caption}>Cada alteração pede confirmação, registra quem alterou e quando, e vale para novas conciliações.</Text>
        {!data?.medicos.length ? <StateView icon="people-outline" title="Nenhum médico ativo cadastrado para esta clínica." /> : data.medicos.map(m => {
          const tipo = m.tipo_repasse || 'percentual';
          const atual = tipo === 'fixo' ? m.valor_repasse_fixo : m.percentual_repasse;
          const last = data.last.get(m.id);
          const editing = ruleForm?.medico.id === m.id;
          return <View key={m.id} style={styles.item}>
            <ListRow icon="medkit-outline" title={m.nome || m.crm} subtitle={`CRM ${m.crm} · ${rule(tipo, atual)}`} meta={last ? `Última alteração por ${last.alterado_por_nome || 'usuário removido'} em ${dateLabel(last.alterado_em)}` : null}
              right={Number(atual || 0) === 0 ? <Badge label="Repasse zerado" tone="warning" /> : undefined} />
            {editing && ruleForm ? <Card style={styles.form}>
              <Chips label="Tipo de repasse" options={[{ value: 'percentual', label: 'Percentual da receita' }, { value: 'fixo', label: 'Valor fixo por atendimento' }]} value={ruleForm.tipo}
                onChange={t => setRuleForm({ ...ruleForm, tipo: t as TipoRepasse, valor: String((t === 'fixo' ? m.valor_repasse_fixo : m.percentual_repasse) || 0).replace('.', ',') })} />
              <Field label={ruleForm.tipo === 'fixo' ? 'Valor fixo (R$)' : 'Percentual (%)'} value={ruleForm.valor} onChangeText={valor => setRuleForm({ ...ruleForm, valor })} keyboardType="decimal-pad"
                hint={parseMoney(ruleForm.valor) === 0 ? 'Com o valor zero, recebimentos deste médico não geram repasse.' : ruleForm.tipo === 'fixo' ? 'Aplicado uma vez para cada atendimento com receita quitada.' : 'Calculado sobre o valor efetivamente recebido em cada atendimento.'} />
              <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setRuleForm(null)} /><Button icon="save-outline" label="Salvar" loading={busy === m.id} onPress={saveRule} /></View>
            </Card> : <View style={styles.actions}><Button variant="secondary" label="Alterar regra" disabled={!!busy} onPress={() => setRuleForm({ medico: m, tipo, valor: String(atual || 0).replace('.', ',') })} /></View>}
          </View>;
        })}
      </Section>
      <Button variant="ghost" icon="wallet-outline" label="Ver no fluxo de caixa" onPress={() => router.push('/modules/fluxo-caixa' as Href)} />
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }, navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  monthText: { flex: 1, textAlign: 'center', color: colors.ink, fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, caption: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 10 }, danger: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 10 },
  form: { marginVertical: 8 }, formTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingVertical: 6 }, item: { marginBottom: 4 },
  right: { alignItems: 'flex-end', gap: 4 }, value: { color: colors.ink, fontSize: 13, fontWeight: '800' },
});
