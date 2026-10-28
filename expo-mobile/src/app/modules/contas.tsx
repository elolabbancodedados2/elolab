import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Segmented, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError, money, parseMoney } from '../../lib/format';
import { db, must, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Tab = 'receber' | 'pagar';
type Conta = { id: string; descricao: string; categoria: string | null; valor: number; valor_pago: number | null; desconto: number | null; acrescimo: number | null; data: string; data_vencimento: string | null; status: string; forma_pagamento: string | null; numero_documento: string | null; paciente_id?: string | null; fornecedor?: string | null; recorrente?: boolean | null };
type Row = Conta & { vencido: boolean; original: string; paciente?: string | null };
type Pag = { id: string; lancamento_id: string; valor: number; estornado_em: string | null };
type PayForm = { conta: Row; forma: string; desconto: string; acrescimo: string; valor: string | null; obs: string; uncertain: boolean };
type Msg = { message: string; error?: boolean; caixa?: boolean } | null;

const LIMIT = 20000;
const PAGE = 60;
const COLS = 'id, descricao, categoria, valor, valor_pago, desconto, acrescimo, data, data_vencimento, status, forma_pagamento, numero_documento';
const STATUS: Record<string, { label: string; tone: Tone }> = { pendente: { label: 'Pendente', tone: 'warning' }, parcial: { label: 'Parcial', tone: 'warning' }, pago: { label: 'Recebido', tone: 'success' }, atrasado: { label: 'Atrasado', tone: 'danger' }, cancelado: { label: 'Cancelado', tone: 'neutral' }, estornado: { label: 'Estornado', tone: 'neutral' } };
const CAT_RECEITA: Record<string, string> = { consulta: 'Consulta Médica', retorno: 'Retorno', procedimento: 'Procedimento', exame: 'Exame / Diagnóstico', cirurgia: 'Cirurgia / Intervenção', internacao: 'Internação', taxa_administrativa: 'Taxa Administrativa', taxa_material: 'Taxa de Material', convenio_repasse: 'Repasse de Convênio', honorario_medico: 'Honorário Médico', fisioterapia: 'Fisioterapia', psicologia: 'Psicologia', pediatria: 'Pediatria', outros: 'Outros' };
const CAT_DESPESA: Record<string, string> = { fornecedores: 'Fornecedores', folha_pagamento: 'Folha de Pagamento', impostos: 'Impostos', aluguel: 'Aluguel', servicos: 'Serviços', equipamentos: 'Equipamentos', marketing: 'Marketing', outros: 'Outros' };
const FORMAS_RECEBER = [{ value: 'pix', label: 'PIX' }, { value: 'dinheiro', label: 'Dinheiro' }, { value: 'cartao_credito', label: 'Cartão de Crédito' }, { value: 'cartao_debito', label: 'Cartão de Débito' }, { value: 'convenio', label: 'Convênio' }, { value: 'transferencia', label: 'Transferência' }, { value: 'boleto', label: 'Boleto' }, { value: 'cheque', label: 'Cheque' }];
const FORMAS_PAGAR = [{ value: 'pix', label: 'PIX' }, { value: 'boleto', label: 'Boleto' }, { value: 'transferencia', label: 'Transferência' }, { value: 'cartao_credito', label: 'Cartão de Crédito' }, { value: 'cartao_debito', label: 'Cartão de Débito' }, { value: 'dinheiro', label: 'Dinheiro' }];
const RPC_FORMA: Record<string, string> = { cartao_credito: 'credito', cartao_debito: 'debito' };
const PERIODS = [{ value: 'mes_atual', label: 'Mês atual' }, { value: 'mes_anterior', label: 'Mês anterior' }, { value: 'ultimos_3', label: 'Últ. 3 meses' }, { value: 'ultimos_6', label: 'Últ. 6 meses' }, { value: 'todos', label: 'Todo período' }];
const isOpen = (s: string) => ['pendente', 'atrasado', 'parcial'].includes(s);
const fmtInput = (v: number) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '');
const realized = (c: Conta) => (c.valor_pago !== null && c.valor_pago !== undefined && Number.isFinite(Number(c.valor_pago)) ? Number(c.valor_pago) : Number(c.valor) || 0);
const balance = (c: Conta, received = Number(c.valor_pago || 0)) => Math.max(0, Number(c.valor || 0) - Number(c.desconto || 0) + Number(c.acrescimo || 0) - received);
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
// Idempotency key (text) for registrar_pagamento; Hermes has no crypto.randomUUID by default.
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
async function fetchAll<T>(build: () => Db): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < LIMIT) {
    const batch = (must<T[]>(await build().range(rows.length, rows.length + 999)) ?? []);
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}
/** Half-open [start, end) civil-date range for the web's period pills, in the clinic's calendar. */
function periodRange(period: string) {
  const m = clinicDate().slice(0, 7);
  const spans: Record<string, [number, number]> = { mes_atual: [0, 1], mes_anterior: [-1, 0], ultimos_3: [-2, 1], ultimos_6: [-5, 1] };
  const s = spans[period];
  return s ? { start: `${shiftMonth(m, s[0])}-01`, end: `${shiftMonth(m, s[1])}-01` } : null;
}

/**
 * Same registrar_pagamento call and idempotency handling as ContasReceber/ContasPagar on the web:
 * an explicit server rejection is final; a lost response is checked by key and otherwise frozen for an identical retry.
 */
function usePayment(clinicId: string | null | undefined, reload: () => void) {
  const keys = useRef<Record<string, string>>({});
  const [form, setForm] = useState<PayForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const begin = (conta: Row, defaults: Partial<PayForm>) => {
    keys.current[conta.id] ||= uuid();
    setMsg(null);
    setForm({ conta, forma: conta.forma_pagamento || 'pix', desconto: '0,00', acrescimo: '0,00', valor: null, obs: '', uncertain: false, ...defaults });
  };
  async function submit(params: Record<string, unknown>, success: (result: { status?: string } | null) => string) {
    if (!form || busy) return;
    const contaId = form.conta.id;
    const key = keys.current[contaId] ?? null;
    let answered = false;
    setBusy(true);
    setMsg(null);
    try {
      const res = await db.rpc('registrar_pagamento', { p_lancamento_id: contaId, ...params, p_chave_idempotencia: key });
      if (res.error) {
        answered = (Number(res.status) >= 400 && Number(res.status) < 500) || /^[0-9A-Z]{5}$/i.test(String(res.error.code || ''));
        throw res.error;
      }
      answered = true;
      if (res.data?.success === false) throw new Error(res.data?.error || 'O pagamento não foi registrado.');
      delete keys.current[contaId];
      setForm(null);
      setMsg({ message: res.data?.repetido ? 'Este pagamento já havia sido registrado. Nada foi cobrado de novo.' : success(res.data) });
      reload();
    } catch (err) {
      if (answered) {
        const message = friendlyError(err);
        setForm(current => current && { ...current, uncertain: false });
        setMsg({ message, error: true, caixa: message.toLowerCase().includes('caixa fechado') });
        reload();
      } else {
        const check = key && clinicId ? await db.from('pagamentos').select('id').eq('clinica_id', clinicId).eq('lancamento_id', contaId).eq('chave_idempotencia', key).maybeSingle() : { data: null, error: new Error('sem chave') };
        if (!check.error && check.data) {
          delete keys.current[contaId];
          setForm(null);
          setMsg({ message: 'O pagamento foi registrado antes da falha de conexão. Nenhum pagamento adicional foi criado.' });
          reload();
        } else {
          setForm(current => current && { ...current, uncertain: true });
          setMsg({ message: 'Não foi possível confirmar se o pagamento foi registrado. Os dados foram bloqueados: toque em “Confirmar novamente” sem alterá-los; a mesma chave impede duplicidade.', error: true });
        }
      }
    } finally { setBusy(false); }
  }
  return { form, setForm, begin, submit, busy, msg, setMsg };
}

function MsgView({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <><Feedback message={msg.message} error={msg.error} />{msg.caixa ? <Button variant="secondary" icon="cash-outline" label="Abrir Recepção e caixa" onPress={() => router.push('/modules/recepcao' as Href)} /> : null}</>;
}

function TabSwitch({ tab }: { tab: Tab }) {
  return <Segmented options={[{ value: 'receber', label: 'A receber' }, { value: 'pagar', label: 'A pagar' }]} value={tab} onChange={value => router.setParams({ tab: value })} />;
}

function statusOf(c: Row) {
  if (c.vencido) return { label: c.original === 'parcial' ? 'Atrasado · parcial' : 'Atrasado', tone: 'danger' as Tone };
  return STATUS[c.status] ?? { label: c.status, tone: 'neutral' as Tone };
}

function Receivables() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [period, setPeriod] = useState('mes_atual');
  const [status, setStatus] = useState('todos');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const range = periodRange(period);
    const contas = await fetchAll<Conta>(() => {
      let q = client.from('lancamentos').select(`${COLS}, paciente_id`).eq('tipo', 'receita').eq('clinica_id', clinicId);
      // Same reference date as the web filter: due date, falling back to the entry date.
      if (range) q = q.or(`and(data_vencimento.gte.${range.start},data_vencimento.lt.${range.end}),and(data_vencimento.is.null,data.gte.${range.start},data.lt.${range.end})`);
      return q.order('created_at', { ascending: false }).order('id', { ascending: true });
    });
    const ids = contas.map(c => c.id);
    const pags: Pag[] = [];
    for (let i = 0; i < ids.length; i += 200) pags.push(...await fetchAll<Pag>(() => client.from('pagamentos').select('id, lancamento_id, valor, estornado_em').eq('clinica_id', clinicId).in('lancamento_id', ids.slice(i, i + 200)).order('id')));
    const patientIds = [...new Set(contas.map(c => c.paciente_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    for (let i = 0; i < patientIds.length; i += 500) {
      for (const p of must<{ id: string; nome: string; nome_social: string | null }[]>(await client.rpc('buscar_pacientes_resumo_financeiro', { p_ids: patientIds.slice(i, i + 500), p_termo: null, p_limite: 500 })) ?? []) names.set(p.id, p.nome_social || p.nome);
    }
    const withRows = new Set(pags.map(p => p.lancamento_id));
    const active = new Map<string, number>();
    for (const p of pags) if (!p.estornado_em) active.set(p.lancamento_id, (active.get(p.lancamento_id) ?? 0) + Number(p.valor || 0));
    const rows: Row[] = contas.map(c => {
      const vencido = ['pendente', 'parcial'].includes(c.status) && !!c.data_vencimento && c.data_vencimento < today;
      return { ...c, vencido, original: c.status, status: vencido && c.status === 'pendente' ? 'atrasado' : c.status, paciente: c.paciente_id ? names.get(c.paciente_id) : null };
    });
    // valorRecebidoDaConta: detailed ledger when the account has payment rows, consolidated valor_pago otherwise.
    const received = (c: Conta) => (withRows.has(c.id) ? active.get(c.id) ?? 0 : realized(c));
    return { rows, received, capped: contas.length >= LIMIT };
  }, [clinicId, period]);

  const pay = usePayment(clinicId, reload);
  const rows = data?.rows ?? [];
  const received = (c: Conta) => data?.received(c) ?? 0;
  const debt = (c: Conta) => balance(c, received(c));
  const term = norm(search.trim());
  const filtered = rows.filter(c => (!term || [c.paciente, c.descricao, c.categoria, c.numero_documento].some(v => norm(v).includes(term)))
    && (status === 'todos' || (status === 'atrasado' ? c.vencido : c.status === status)));
  const stats = {
    pendente: filtered.filter(c => ['pendente', 'parcial'].includes(c.status) && !c.vencido),
    atrasado: filtered.filter(c => c.vencido),
    pago: filtered.filter(c => c.status === 'pago' || c.status === 'parcial'),
    total: filtered.filter(c => c.status !== 'cancelado' && c.status !== 'estornado').reduce((a, c) => a + Number(c.valor), 0),
  };
  const toggle = (value: string) => { setStatus(status === value ? 'todos' : value); setShown(PAGE); };

  const f = pay.form;
  const desconto = f ? (f.desconto.trim() ? parseMoney(f.desconto) : 0) : 0;
  const acrescimo = f ? (f.acrescimo.trim() ? parseMoney(f.acrescimo) : 0) : 0;
  const valorFinal = f ? Number(f.conta.valor) - desconto + acrescimo - received(f.conta) : 0;
  const valorPagamento = f ? (f.valor === null ? valorFinal : parseMoney(f.valor)) : 0;
  const invalid = !Number.isFinite(valorFinal) || valorFinal <= 0 || !Number.isFinite(valorPagamento) || valorPagamento <= 0 || valorPagamento > valorFinal + 1e-9;

  function confirm() {
    if (!f) return;
    if (!Number.isFinite(desconto) || !Number.isFinite(acrescimo) || desconto < 0 || acrescimo < 0 || !Number.isFinite(valorFinal) || valorFinal <= 0) return pay.setMsg({ message: 'Confira o desconto e o acréscimo. O valor recebido precisa ser maior que zero e os ajustes não podem ser negativos.', error: true });
    if (!Number.isFinite(valorPagamento) || valorPagamento <= 0) return pay.setMsg({ message: 'Informe um valor recebido maior que zero.', error: true });
    if (valorPagamento > valorFinal + 1e-9) return pay.setMsg({ message: `O valor recebido não pode ser maior que o saldo em aberto. Saldo disponível: ${money(valorFinal)}.`, error: true });
    void pay.submit({ p_pagamentos: [{ forma_pagamento: RPC_FORMA[f.forma] || f.forma, valor: Number(valorPagamento.toFixed(2)), parcelas: 1 }], p_desconto: Number(desconto.toFixed(2)), p_acrescimo: Number(acrescimo.toFixed(2)), p_observacoes: f.obs.trim() || null }, () => `Pagamento confirmado — ${f.conta.paciente || 'Particular'}`);
  }

  function cancel(c: Row) {
    Alert.alert('Cancelar conta', `Cancelar "${c.descricao}" de ${money(c.valor)}? A conta deixa de ser cobrada.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Cancelar conta', style: 'destructive', onPress: () => void (async () => {
        try {
          const ok = must(await db.rpc('cancelar_lancamento_pendente', { p_lancamento_id: c.id }));
          if (!ok) throw new Error('Esta conta já foi alterada ou não está mais pendente. Atualize a lista.');
          pay.setMsg({ message: 'Conta cancelada.' });
        } catch (err) { pay.setMsg({ message: friendlyError(err), error: true }); } finally { reload(); }
      })() },
    ]);
  }

  return <ModuleScreen moduleKey="contas" subtitle="Cobranças, recebimentos e vencimentos." refreshing={refreshing} onRefresh={refresh}>
    <TabSwitch tab="receber" />
    <Chips label="Período" options={PERIODS} value={period} onChange={value => { setPeriod(value); setShown(PAGE); }} />
    <MsgView msg={pay.msg} />
    {f ? <Card style={styles.form}>
      <Text style={styles.formTitle}>Confirmar recebimento</Text>
      <Text style={styles.caption}>{f.conta.paciente || 'Particular'} · {f.conta.descricao}</Text>
      <Text style={styles.caption}>Valor original {money(f.conta.valor)}{received(f.conta) > 0 ? ` · Já recebido ${money(received(f.conta))}` : ''}</Text>
      <Text style={styles.hint}>Registre o recebimento com o caixa do dia aberto. Maquininha Mercado Pago Point: use o navegador.</Text>
      <Chips label="Forma de pagamento" options={FORMAS_RECEBER} value={f.forma} onChange={forma => !f.uncertain && pay.setForm({ ...f, forma })} />
      <View style={styles.row2}>
        <View style={styles.fill}><Field label="Desconto (R$)" value={f.desconto} editable={!f.uncertain} keyboardType="decimal-pad" onChangeText={v => pay.setForm({ ...f, desconto: v })} error={f.desconto.trim() && !Number.isFinite(parseMoney(f.desconto)) ? 'Valor inválido.' : undefined} /></View>
        <View style={styles.fill}><Field label="Acréscimo (R$)" value={f.acrescimo} editable={!f.uncertain} keyboardType="decimal-pad" onChangeText={v => pay.setForm({ ...f, acrescimo: v })} error={f.acrescimo.trim() && !Number.isFinite(parseMoney(f.acrescimo)) ? 'Valor inválido.' : undefined} /></View>
      </View>
      <Field label="Valor recebido (R$)" value={f.valor ?? fmtInput(valorFinal)} editable={!f.uncertain} keyboardType="decimal-pad" onChangeText={v => pay.setForm({ ...f, valor: v })}
        hint={`Saldo após este recebimento: ${Number.isFinite(valorFinal - valorPagamento) ? money(Math.max(0, valorFinal - valorPagamento)) : '—'}`} error={f.valor !== null && invalid ? 'O valor deve ser maior que zero e não pode ultrapassar o saldo disponível.' : undefined} />
      <Field label="Observações" value={f.obs} editable={!f.uncertain} onChangeText={obs => pay.setForm({ ...f, obs })} placeholder="Opcional" multiline />
      <Text style={styles.total}>Valor do recebimento: {Number.isFinite(valorPagamento) ? money(valorPagamento) : '—'}</Text>
      <View style={styles.actions}>{f.uncertain ? null : <Button variant="ghost" label="Cancelar" disabled={pay.busy} onPress={() => pay.setForm(null)} />}<Button icon="checkmark" label={f.uncertain ? 'Confirmar novamente' : 'Confirmar'} loading={pay.busy} disabled={invalid} onPress={confirm} /></View>
    </Card> : null}
    {loading ? <StateView loading title="Carregando contas a receber…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as contas" message={error} onAction={reload} /> : <>
      {data?.capped ? <Text accessibilityRole="alert" style={styles.warn}>A leitura atingiu {LIMIT.toLocaleString('pt-BR')} contas. A lista e os indicadores podem estar incompletos.</Text> : null}
      <View style={styles.stats}>
        <Stat label={`Pendente · ${stats.pendente.length}`} value={money(stats.pendente.reduce((a, c) => a + debt(c), 0))} tone="warning" onPress={() => toggle('pendente')} />
        <Stat label={`Atrasado · ${stats.atrasado.length}`} value={money(stats.atrasado.reduce((a, c) => a + debt(c), 0))} tone="danger" onPress={() => toggle('atrasado')} />
        <Stat label={`Recebido · ${stats.pago.length}`} value={money(stats.pago.reduce((a, c) => a + received(c), 0))} tone="success" onPress={() => toggle('pago')} />
        <Stat label={`Total no filtro · ${filtered.length}`} value={money(stats.total)} onPress={() => toggle('todos')} />
      </View>
      <View style={styles.gap} />
      <Field label="Buscar" value={search} onChangeText={v => { setSearch(v); setShown(PAGE); }} placeholder="Paciente, descrição ou documento" />
      <Chips options={[{ value: 'todos', label: 'Todos' }, { value: 'pendente', label: 'Pendente' }, { value: 'atrasado', label: 'Atrasado' }, { value: 'parcial', label: 'Parcial' }, { value: 'pago', label: 'Recebido' }, { value: 'cancelado', label: 'Cancelado' }]} value={status} onChange={value => { setStatus(value); setShown(PAGE); }} />
      {!filtered.length ? <StateView icon="receipt-outline" title="Nenhuma conta encontrada" message={rows.length ? 'Ajuste a busca, o status ou o período.' : 'Cadastre receitas no navegador para acompanhar recebimentos.'} /> :
        <Section title={`${filtered.length} conta(s)`}>{filtered.slice(0, shown).map(c => {
          const s = statusOf(c);
          return <View key={c.id} style={styles.item}>
            <ListRow icon="receipt-outline" tone={s.tone} title={c.paciente || 'Particular'} subtitle={c.descricao}
              meta={[CAT_RECEITA[c.categoria || ''] || c.categoria, c.data_vencimento ? `Vence ${dateLabel(c.data_vencimento)}` : null, c.status === 'parcial' ? `Saldo ${money(debt(c))}` : null].filter(Boolean).join(' · ')}
              right={<View style={styles.right}><Text style={styles.value}>{money(c.valor)}</Text><Badge label={s.label} tone={s.tone} /></View>} />
            {isOpen(c.status) ? <View style={styles.actions}>
              {c.status === 'pendente' || c.status === 'atrasado' ? <Button variant="danger" label="Cancelar" disabled={pay.busy} onPress={() => cancel(c)} /> : null}
              <Button label={c.status === 'parcial' ? 'Receber saldo' : 'Receber'} icon="cash-outline" disabled={pay.busy || !!f?.uncertain} onPress={() => pay.begin(c, { desconto: fmtInput(Number(c.desconto || 0)), acrescimo: fmtInput(Number(c.acrescimo || 0)) })} />
            </View> : null}
          </View>;
        })}{filtered.length > shown ? <Button variant="secondary" label={`Mostrar mais (${filtered.length - shown} restantes)`} onPress={() => setShown(shown + PAGE)} /> : null}</Section>}
      <Section title="No navegador">
        <Text style={styles.note}>Cadastro de nova receita, estorno de pagamento com motivo, exportação e gráficos por categoria ficam no navegador.</Text>
        <OpenOnWeb path="/contas?tab=receber" />
      </Section>
    </>}
  </ModuleScreen>;
}

function Payables() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [status, setStatus] = useState('todos');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const contas = await fetchAll<Conta>(() => client.from('lancamentos').select(`${COLS}, fornecedor, recorrente`).eq('tipo', 'despesa').eq('clinica_id', clinicId).order('data_vencimento', { ascending: true }).order('id', { ascending: true }));
    return contas.map<Row>(c => {
      const vencido = ['pendente', 'parcial'].includes(c.status) && !!c.data_vencimento && c.data_vencimento < today;
      return { ...c, vencido, original: c.status, status: vencido ? 'atrasado' : c.status };
    });
  }, [clinicId]);

  const pay = usePayment(clinicId, reload);
  const contas = data ?? [];
  const term = norm(search.trim());
  const filtered = contas.filter(c => (!term || [c.descricao, c.fornecedor, c.numero_documento].some(v => norm(v).includes(term))) && (status === 'todos' || (status === 'atrasado' ? c.vencido : c.status === status)));
  const pendentes = contas.filter(c => ['pendente', 'parcial'].includes(c.status) && !c.vencido);
  const vencidas = contas.filter(c => c.vencido);
  const toggle = (value: string) => { setStatus(status === value && value !== 'todos' ? 'todos' : value); setShown(PAGE); };

  const f = pay.form;
  const saldo = f ? Number(balance(f.conta).toFixed(2)) : 0;
  const valor = f ? parseMoney(f.valor ?? '') : 0;

  function confirm() {
    if (!f) return;
    if (!Number.isFinite(saldo) || saldo <= 0) return pay.setMsg({ message: 'Esta conta não tem saldo pendente. Atualize a lista antes de continuar.', error: true });
    if (!Number.isFinite(valor) || valor <= 0) return pay.setMsg({ message: 'Informe um valor de pagamento maior que zero, com até duas casas decimais.', error: true });
    if (valor > saldo) return pay.setMsg({ message: 'O valor do pagamento não pode ser maior que o saldo em aberto.', error: true });
    const recorrente = !!f.conta.recorrente;
    void pay.submit({ p_pagamentos: [{ forma_pagamento: RPC_FORMA[f.forma] || f.forma, valor, parcelas: 1 }], p_desconto: Number(f.conta.desconto || 0), p_acrescimo: Number(f.conta.acrescimo || 0), p_observacoes: f.obs.trim() || null },
      result => (recorrente && result?.status === 'pago' ? 'Pagamento registrado e próxima despesa programada.' : 'Pagamento registrado no caixa!'));
  }

  return <ModuleScreen moduleKey="contas" subtitle="Despesas, fornecedores e controle de vencimentos." refreshing={refreshing} onRefresh={refresh}>
    <TabSwitch tab="pagar" />
    <MsgView msg={pay.msg} />
    {f ? <Card style={styles.form}>
      <Text style={styles.formTitle}>Registrar pagamento</Text>
      <Text style={styles.caption}>{f.conta.descricao}{f.conta.fornecedor ? ` · ${f.conta.fornecedor}` : ''}</Text>
      <Text style={styles.caption}>Saldo em aberto {money(saldo)}</Text>
      <Chips label="Forma de pagamento" options={FORMAS_PAGAR} value={f.forma} onChange={forma => !f.uncertain && pay.setForm({ ...f, forma })} />
      <Field label="Valor pago (R$)" value={f.valor ?? ''} editable={!f.uncertain} keyboardType="decimal-pad" onChangeText={v => pay.setForm({ ...f, valor: v })} error={f.valor && (!Number.isFinite(valor) || valor <= 0 || valor > saldo) ? 'Informe um valor maior que zero e até o saldo em aberto.' : undefined} />
      <Field label="Observações" value={f.obs} editable={!f.uncertain} onChangeText={obs => pay.setForm({ ...f, obs })} placeholder="Opcional" multiline />
      <View style={styles.actions}>{f.uncertain ? null : <Button variant="ghost" label="Cancelar" disabled={pay.busy} onPress={() => pay.setForm(null)} />}<Button icon="checkmark" label={f.uncertain ? 'Confirmar novamente' : 'Confirmar pagamento'} loading={pay.busy} disabled={saldo <= 0} onPress={confirm} /></View>
    </Card> : null}
    {loading ? <StateView loading title="Carregando contas a pagar…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar contas a pagar" message={error} onAction={reload} /> : <>
      {contas.length >= LIMIT ? <Text accessibilityRole="alert" style={styles.warn}>A leitura atingiu {LIMIT.toLocaleString('pt-BR')} contas. A lista e os indicadores podem estar incompletos; não use estes totais para fechamento.</Text> : null}
      <View style={styles.stats}>
        <Stat label={`Total geral · ${contas.length}`} value={money(contas.filter(c => c.status !== 'cancelado' && c.status !== 'estornado').reduce((a, c) => a + Number(c.valor), 0))} onPress={() => toggle('todos')} />
        <Stat label={`Pendente · ${pendentes.length}`} value={money(pendentes.reduce((a, c) => a + balance(c), 0))} tone="warning" onPress={() => toggle('pendente')} />
        <Stat label={`Vencidas · ${vencidas.length}`} value={money(vencidas.reduce((a, c) => a + balance(c), 0))} tone="danger" onPress={() => toggle('atrasado')} />
        <Stat label={`Pago · ${contas.filter(c => c.original === 'pago').length}`} value={money(contas.filter(c => ['pago', 'parcial'].includes(c.status) || Number(c.valor_pago || 0) > 0).reduce((a, c) => a + realized(c), 0))} tone="success" onPress={() => toggle('pago')} />
      </View>
      <View style={styles.gap} />
      <Field label="Buscar" value={search} onChangeText={v => { setSearch(v); setShown(PAGE); }} placeholder="Descrição, fornecedor ou documento" />
      <Chips options={[{ value: 'todos', label: 'Todos' }, { value: 'pendente', label: 'Pendente' }, { value: 'atrasado', label: 'Vencidas' }, { value: 'parcial', label: 'Parcial' }, { value: 'pago', label: 'Pago' }]} value={status} onChange={value => { setStatus(value); setShown(PAGE); }} />
      {!filtered.length ? <StateView icon="card-outline" title="Nenhuma conta encontrada" message={contas.length ? 'Ajuste a busca ou o status.' : 'Cadastre despesas no navegador para controlar vencimentos.'} /> :
        <Section title={`${filtered.length} conta(s)`}>{filtered.slice(0, shown).map(c => {
          const s = c.vencido ? statusOf(c) : { label: c.status === 'pago' ? 'Pago' : STATUS[c.status]?.label ?? c.status, tone: STATUS[c.status]?.tone ?? 'neutral' as Tone };
          return <View key={c.id} style={styles.item}>
            <ListRow icon="card-outline" tone={s.tone} title={c.descricao} subtitle={c.fornecedor}
              meta={[CAT_DESPESA[c.categoria || ''] || c.categoria, c.data_vencimento ? `Vence ${dateLabel(c.data_vencimento)}` : null, Number(c.valor_pago || 0) > 0 && isOpen(c.status) ? `Saldo ${money(balance(c))}` : null].filter(Boolean).join(' · ')}
              right={<View style={styles.right}><Text style={styles.value}>{money(c.valor)}</Text><Badge label={s.label} tone={s.tone} /></View>} />
            {isOpen(c.status) ? <View style={styles.actions}><Button label={Number(c.valor_pago || 0) > 0 ? 'Pagar saldo' : 'Pagar'} icon="checkmark" disabled={pay.busy || !!f?.uncertain} onPress={() => pay.begin(c, { valor: fmtInput(balance(c)) })} /></View> : null}
          </View>;
        })}{filtered.length > shown ? <Button variant="secondary" label={`Mostrar mais (${filtered.length - shown} restantes)`} onPress={() => setShown(shown + PAGE)} /> : null}</Section>}
      <Section title="No navegador">
        <Text style={styles.note}>Cadastro de nova despesa (com recorrência, centro de custo e documento) e o histórico de alterações ficam no navegador.</Text>
        <OpenOnWeb path="/contas?tab=pagar" />
      </Section>
    </>}
  </ModuleScreen>;
}

export default function AccountsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return tab === 'pagar' ? <Payables /> : <Receivables />;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, gap: { height: 14 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 10 },
  form: { marginBottom: 10 }, formTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, caption: { color: colors.muted, fontSize: 12, marginTop: 3 }, hint: { color: colors.muted, fontSize: 11, marginVertical: 10 },
  row2: { flexDirection: 'row', gap: 10 }, fill: { flex: 1 }, total: { color: colors.success, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingVertical: 8 }, item: { marginBottom: 4 },
  right: { alignItems: 'flex-end', gap: 4 }, value: { color: colors.ink, fontSize: 13, fontWeight: '800' }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
});
