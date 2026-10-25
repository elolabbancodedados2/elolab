import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Segmented, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, friendlyError, money, timeLabel } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Patient = { id: string; nome: string | null; nome_social: string | null; telefone: string | null; convenio_id: string | null; ativo: boolean | null };
type Appt = { id: string; paciente_id: string; medico_id: string; data: string; hora_inicio: string; status: string; tipo: string | null; observacoes: string | null; clinica_id: string; pacientes: Patient | null; medicos: { nome: string | null } | null };
type Queue = { id: string; agendamento_id: string; status: string; cobranca_estado: string | null; horario_chegada: string | null; updated_at: string | null };
type Bill = { id: string; agendamento_id: string; status: string; valor: number | null; desconto: number | null; acrescimo: number | null; valor_pago: number | null; forma_pagamento: string | null };
type Row = { ag: Appt; fila?: Queue; lanc?: Bill; step: number };
type Tab = 'todos' | 'checkin' | 'balcao' | 'atendimento' | 'concluido' | 'faltou';

const tabs: { value: Tab; label: string }[] = [{ value: 'todos', label: 'Todos' }, { value: 'checkin', label: 'Check-in' }, { value: 'balcao', label: 'Balcão' }, { value: 'atendimento', label: 'Atendimento' }, { value: 'concluido', label: 'Concluídos' }, { value: 'faltou', label: 'Faltas' }];
const stepInfo: { label: string; tone: Tone }[] = [{ label: 'Check-in', tone: 'warning' }, { label: 'Balcão', tone: 'warning' }, { label: 'Atendimento', tone: 'primary' }, { label: 'Finalizado', tone: 'info' }, { label: 'Concluído', tone: 'success' }];
const closed = ['cancelado', 'faltou', 'finalizado', 'atendimento_finalizado'];
const returnDays = [7, 15, 30, 60, 90, 180];
const isExam = (tipo: string | null) => ['exame', 'exames'].includes((tipo ?? '').trim().toLocaleLowerCase('pt-BR'));
const nameOf = (p: Patient | null | undefined) => p?.nome_social || p?.nome || 'Paciente';
const cents = (v: unknown) => Math.round(Number(v || 0) * 100);
const balance = (l: Bill) => Math.max(0, (cents(l.valor) - cents(l.desconto) + cents(l.acrescimo) - cents(l.valor_pago)) / 100);
const toMoney = (v: unknown) => { const s = typeof v === 'string' ? v.trim().replace(/\s/g, '') : v; const n = Number(typeof s === 'string' && s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : 0; };
const norm = (v: unknown) => String(v || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^\s*\d+[\s-]*\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const clinicMinutes = () => { const [h, m] = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number); return h * 60 + m; };

/** Same derivation as the web receptionWorkflow.patientStep. */
function stepOf(ag: Appt, fila?: Queue, lanc?: Bill) {
  if (ag.status === 'aguardando_pagamento_adicional') return 3;
  if (['finalizado', 'atendimento_finalizado'].includes(ag.status)) return fila?.status === 'concluido' ? 4 : 3;
  if (ag.status === 'em_atendimento') return 2;
  if (fila?.cobranca_estado === 'pendente') return 1;
  if (fila?.cobranca_estado === 'gratuita') return 2;
  if (fila) return !lanc || lanc.status === 'pago' ? 2 : 1;
  return ['confirmado', 'aguardando', 'agendado'].includes(ag.status) ? 0 : -1;
}

/**
 * Consultation branch of the web createAutoBillingDetailed: same catalog lookups and atomic RPC.
 * shortcut: exam pricing (convenio/internal/catalog tables) is not ported; exam check-ins go to the web.
 */
async function billConsultation(ag: Appt, clinicId: string, today: string): Promise<'created' | 'already_exists' | 'free'> {
  const existing = must(await db.from('lancamentos').select('id, valor, categoria, status').eq('agendamento_id', ag.id).eq('clinica_id', clinicId).limit(1)) ?? [];
  if (existing.length) {
    if (['cancelado', 'estornado'].includes(String(existing[0].status))) throw new Error('A cobrança anterior deste agendamento foi cancelada ou estornada. Regularize-a no financeiro antes do check-in.');
    return 'already_exists';
  }
  const tipo = ag.tipo;
  const convenioId = ag.pacientes?.convenio_id ?? null;
  let valor = 0, descricao = 'Consulta', priced = false;
  if (tipo) {
    const catalogName = ['retorno', 'consulta retorno', 'consulta de retorno'].includes(norm(tipo)) ? 'Retorno' : tipo;
    const tc = must(await db.from('tipos_consulta').select('id, nome, valor_particular').ilike('nome', catalogName).eq('ativo', true).eq('clinica_id', clinicId).limit(1).maybeSingle());
    if (tc) {
      valor = toMoney(tc.valor_particular); descricao = tc.nome; priced = true;
      if (convenioId && tc.id) {
        const pc = must(await db.from('precos_consulta_convenio').select('valor').eq('convenio_id', convenioId).eq('tipo_consulta_id', tc.id).eq('ativo', true).eq('clinica_id', clinicId).maybeSingle());
        if (pc) valor = toMoney(pc.valor);
      }
    }
  }
  if (valor === 0 && convenioId && !priced) {
    const conv = must(await db.from('convenios').select('valor_consulta').eq('id', convenioId).maybeSingle());
    if (conv?.valor_consulta) valor = toMoney(conv.valor_consulta);
  }
  if (valor <= 0) {
    if (priced) return 'free';
    throw new Error(`Não há preço cadastrado para a consulta "${tipo || 'atendimento'}".`);
  }
  const result = must(await db.rpc('criar_cobranca_checkin_atomica', { p_agendamento_id: ag.id, p_clinica_id: clinicId, p_paciente_id: ag.paciente_id, p_categoria: 'consulta', p_descricao: tipo ? `${descricao} - ${nameOf(ag.pacientes)} - ${tipo}` : `${descricao} — ${nameOf(ag.pacientes)}`, p_valor: valor, p_data: today }));
  if (result === 'already_exists') return 'already_exists';
  if (result !== 'created') throw new Error('Não foi possível confirmar a criação da cobrança.');
  return 'created';
}

/** Port of the web checkinComCobranca: check-in, billing, then a safe rollback when billing fails. */
async function checkinWithBilling(ag: Appt, clinicId: string, today: string): Promise<string> {
  const ck = must(await db.rpc('realizar_checkin', { p_agendamento_id: ag.id, p_prioridade: 'normal' }));
  const p = { p_agendamento_id: ag.id, p_clinica_id: clinicId };
  try {
    const outcome = await billConsultation(ag, clinicId, today);
    must(await db.rpc('confirmar_estado_cobranca_checkin', { ...p, p_gratuito: outcome === 'free' }));
    if (ck?.repetido) return outcome === 'free' ? 'Este agendamento já estava na fila. Atendimento gratuito confirmado; paciente continua na fila.' : 'Este agendamento já estava na fila. A situação da cobrança foi conferida no financeiro.';
    if (outcome === 'free') return 'Check-in realizado! Atendimento sem cobrança. Paciente pronto para ser chamado.';
    return outcome === 'already_exists' ? 'Check-in realizado! Cobrança existente conferida no financeiro.' : 'Check-in realizado! Paciente encaminhado ao balcão para pagamento.';
  } catch (billingError) {
    const detail = billingError instanceof Error ? billingError.message : 'Erro desconhecido ao gerar a cobrança.';
    // The write may have committed before its response was lost: check before undoing the queue entry.
    const active = await db.rpc('tem_cobranca_ativa_do_agendamento', p);
    if (active.error) throw new Error(`A cobrança não pôde ser confirmada. Atualize a fila e confira o financeiro antes de avançar. ${detail}`);
    if (active.data === true) {
      const confirm = await db.rpc('confirmar_estado_cobranca_checkin', { ...p, p_gratuito: false });
      if (confirm.error) throw new Error(`A cobrança existe, mas o estado do check-in ainda não foi confirmado. Atualize e tente retomar. ${confirm.error.message}`);
      return 'Check-in realizado e cobrança confirmada no financeiro.';
    }
    if (ck?.repetido) throw new Error(`A cobrança não foi confirmada: ${detail}. Atualize a fila e confira o financeiro antes de avançar.`);
    if (!ck?.fila_id || !ck?.status_anterior) throw new Error(`A cobrança não foi confirmada e não foi possível verificar o estado original do check-in. Verifique este paciente antes de continuar. ${detail}`);
    const rollback = await db.rpc('desfazer_checkin_sem_cobranca', { ...p, p_fila_id: ck.fila_id, p_status_anterior: ck.status_anterior });
    if (rollback.error) throw new Error(`A cobrança falhou e não foi possível desfazer o check-in com segurança. Verifique este paciente antes de continuar. ${detail}`);
    if (rollback.data?.motivo === 'cobranca_ativa') return 'Check-in realizado e cobrança confirmada no financeiro.';
    throw new Error(`O check-in não foi confirmado porque a cobrança falhou: ${detail}.${rollback.data?.desfeito ? ' A entrada na fila foi desfeita.' : ' O estado do check-in mudou durante a tentativa. Atualize a fila e confira a cobrança antes de continuar.'}`);
  }
}

export default function ReceptionScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const canReception = Boolean(profile?.roles.some(r => r === 'admin' || r === 'recepcao'));
  const canTriage = Boolean(profile?.roles.some(r => ['admin', 'enfermagem', 'medico'].includes(r)));
  const [view, setView] = useState<'recepcao' | 'caixa'>(canReception ? 'recepcao' : 'caixa');
  const [tab, setTab] = useState<Tab>('todos');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<Row | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();
  const current = canReception ? view : 'caixa';

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [appts, cash] = await Promise.all([
      client.from('agendamentos').select('id, paciente_id, medico_id, data, hora_inicio, status, tipo, observacoes, clinica_id, pacientes(id, nome, nome_social, telefone, convenio_id, ativo), medicos(nome)')
        .eq('clinica_id', clinicId).eq('data', today).neq('status', 'cancelado').order('hora_inicio', { ascending: true }),
      client.from('caixa_diario').select('id, aberto, data').eq('data', today).eq('clinica_id', clinicId).maybeSingle(),
    ]);
    const list = (must(appts) ?? []) as Appt[];
    const ids = list.map(a => a.id);
    const [queue, bills] = ids.length ? await Promise.all([
      client.from('fila_atendimento').select('*').eq('clinica_id', clinicId).in('agendamento_id', ids),
      client.from('lancamentos').select('*').eq('clinica_id', clinicId).eq('tipo', 'receita').in('agendamento_id', ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    const filas = (must(queue) ?? []) as Queue[];
    const lancs = (must(bills) ?? []) as Bill[];
    const rows: Row[] = list.map(ag => { const fila = filas.find(f => f.agendamento_id === ag.id); const lanc = lancs.find(l => l.agendamento_id === ag.id); return { ag, fila, lanc, step: stepOf(ag, fila, lanc) }; });
    return { rows, cashOpen: cash.error ? null : Boolean(cash.data?.aberto) };
  }, [clinicId, today]);

  const rows = data?.rows ?? [];
  const nowMin = clinicMinutes();
  const q = search.trim().toLocaleLowerCase('pt-BR');
  const shown = rows.filter(e => (tab === 'todos' || (tab === 'checkin' && e.step === 0) || (tab === 'balcao' && e.step === 1) || (tab === 'atendimento' && (e.step === 2 || e.step === 3)) || (tab === 'concluido' && e.step === 4) || (tab === 'faltou' && e.ag.status === 'faltou'))
    && (!q || [nameOf(e.ag.pacientes), e.ag.medicos?.nome, e.ag.hora_inicio].some(v => (v ?? '').toLocaleLowerCase('pt-BR').includes(q))));
  const waits = rows.filter(e => (e.step === 1 || e.step === 2) && e.ag.status !== 'em_atendimento' && e.fila?.horario_chegada).map(e => Math.max(0, Math.floor((Date.now() - new Date(e.fila!.horario_chegada!).getTime()) / 60000)));
  const avgWait = waits.length ? Math.round(waits.reduce((s, m) => s + m, 0) / waits.length) : null;
  const nextId = rows.filter(e => e.step === 2 && e.ag.status !== 'em_atendimento' && e.fila).sort((a, b) => new Date(a.fila?.horario_chegada || 0).getTime() - new Date(b.fila?.horario_chegada || 0).getTime())[0]?.ag.id;

  async function run(id: string, work: () => Promise<string>, fallback: string) {
    if (busy) return;
    setBusy(id); setFeedback(null);
    try { setFeedback({ message: await work() }); } catch (err) { setFeedback({ message: friendlyError(err, fallback), error: true }); } finally { setBusy(null); reload(); }
  }

  function checkin(e: Row) {
    void run(e.ag.id, async () => {
      if (!clinicId) throw new Error('Unidade da sessão não identificada. Atualize o perfil.');
      // Pre-checks mirror the web validarCheckin; the realizar_checkin RPC stays the authority.
      const p = e.ag.pacientes;
      if (!p) throw new Error('Cadastro do paciente não carregado.');
      if (p.id !== e.ag.paciente_id) throw new Error('O paciente não corresponde ao agendamento.');
      if (p.ativo === false) throw new Error('Paciente inativo. Reative o cadastro antes do check-in.');
      if (e.ag.data !== today) throw new Error('O agendamento não é de hoje.');
      if (closed.includes(e.ag.status)) throw new Error(`O agendamento está ${e.ag.status} e não aceita check-in.`);
      if (e.ag.status === 'em_atendimento') throw new Error('O atendimento já foi iniciado.');
      if (e.ag.clinica_id !== clinicId) throw new Error('O agendamento pertence a outra unidade.');
      return checkinWithBilling(e.ag, clinicId, today);
    }, 'Erro ao realizar check-in');
  }

  function call(e: Row, counter: boolean) {
    void run(e.ag.id, async () => {
      if (!clinicId) throw new Error('Clínica não identificada. Atualize a sessão antes de chamar o paciente.');
      if (!e.fila) throw new Error('O paciente não está na fila de atendimento. Atualize a recepção antes de chamá-lo ao balcão.');
      // Version check like the web chamarPacienteNaFila: two terminals cannot announce the same call twice.
      let query = db.from('fila_atendimento').update({ status: 'chamado' }).eq('id', e.fila.id).eq('clinica_id', clinicId).in('status', ['aguardando', 'chamado']);
      query = e.fila.updated_at ? query.eq('updated_at', e.fila.updated_at) : query.is('updated_at', null);
      const rowsUpdated = must(await query.select('id'));
      if (!rowsUpdated?.length) throw new Error('A fila mudou antes da chamada. Outra pessoa pode ter chamado este paciente. A lista foi atualizada.');
      return counter ? `${nameOf(e.ag.pacientes)} chamado ao balcão! Chamado no painel da sala de espera.` : 'Paciente chamado!';
    }, 'Erro ao chamar paciente');
  }

  const start = (e: Row) => void run(e.ag.id, async () => {
    const res = must(await db.rpc('iniciar_atendimento_atomico', { p_agendamento_id: e.ag.id, p_fila_id: e.fila!.id }));
    return res?.repetido ? 'Atendimento já iniciado' : 'Atendimento iniciado!';
  }, 'Erro ao iniciar atendimento');

  function finish(e: Row, days: number | null) {
    void run(e.ag.id, async () => {
      const res = must(await db.rpc('finalizar_atendimento_atomico', { p_agendamento_id: e.ag.id, p_fila_id: e.fila?.id ?? null, p_agendar_retorno: days !== null, p_dias_retorno: days, p_tipo_exame: isExam(e.ag.tipo) ? e.ag.observacoes : null }));
      const r = Array.isArray(res) ? res[0] : null;
      if (!r) throw new Error('A finalização não retornou uma confirmação.');
      setFinishing(null);
      if (r.repetido) return 'Atendimento já estava finalizado. A fila foi sincronizada.';
      const msg = r.status_agendamento === 'aguardando_pagamento_adicional' ? 'Atendimento finalizado! Agendamento aguardando pagamento adicional.' : 'Atendimento finalizado!';
      return days === null ? msg : `${msg} Retorno agendado para ${days} dias.`;
    }, 'Erro ao finalizar');
  }

  const conclude = (e: Row) => Alert.alert('Concluir atendimento', 'Tem certeza que deseja concluir este atendimento? Ele será movido para o histórico.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Concluir', onPress: () => void run(e.ag.id, async () => {
      if (must(await db.rpc('concluir_fila_atomico', { p_agendamento_id: e.ag.id, p_fila_id: e.fila!.id })) !== true) throw new Error('O atendimento mudou. Atualize a recepção e tente novamente.');
      return 'Atendimento concluído com sucesso!';
    }, 'Erro ao concluir') },
  ]);

  const noShow = (e: Row) => Alert.alert('Marcar falta', `${nameOf(e.ag.pacientes)} será marcado como "não compareceu" e sairá da fila. Se houver cobrança pendente, ela será cancelada; o horário continua no histórico.`, [
    { text: 'Voltar', style: 'cancel' },
    { text: 'Marcar falta', style: 'destructive', onPress: () => void run(e.ag.id, async () => {
      const res = must(await db.rpc('marcar_atendimento_nao_realizado', { p_agendamento_id: e.ag.id, p_clinica_id: clinicId }));
      if (!res?.desfeito) throw new Error(res?.motivo === 'pagamento_registrado' ? 'Há pagamento registrado. Estorne ou reconcilie o valor antes de marcar como não realizado.' : 'O atendimento mudou desde que a lista foi carregada. Atualize a tela e tente novamente.');
      return res.cobranca_cancelada ? 'Falta registrada. Atendimento cancelado e cobrança pendente cancelada.' : res.havia_cobranca ? 'Falta registrada. A cobrança já estava cancelada ou estornada.' : 'Falta registrada. Atendimento cancelado sem cobrança registrada.';
    }, 'Não foi possível registrar a falta') },
  ]);

  function actions(e: Row) {
    const { ag, fila, lanc, step } = e;
    const off = busy !== null;
    const min = /^\d{2}:\d{2}/.test(ag.hora_inicio ?? '') ? Number(ag.hora_inicio.slice(0, 2)) * 60 + Number(ag.hora_inicio.slice(3, 5)) : null;
    const late = step === 0 && min !== null && min < nowMin;
    const phone = (ag.pacientes?.telefone ?? '').replace(/\D/g, '');
    const onWay = late && phone.length >= 10 ? `https://wa.me/${phone.startsWith('55') && phone.length >= 12 ? phone : `55${phone}`}?text=${encodeURIComponent(`Olá, ${nameOf(ag.pacientes).split(' ')[0]}! Sua consulta estava marcada para ${ag.hora_inicio.slice(0, 5)}. Está a caminho?`)}` : null;
    const saldo = lanc ? balance(lanc) : 0;
    const examHandOff = <OpenOnWeb label="Check-in de exame no navegador" path="/recepcao" />;
    if (step === 0) return <>
      {isExam(ag.tipo) ? examHandOff : <Button icon="person-add-outline" label="Check-in" loading={busy === ag.id} disabled={off} onPress={() => checkin(e)} />}
      {canTriage ? <Button variant="secondary" icon="pulse-outline" label="Triagem" disabled={off} onPress={() => router.push({ pathname: '/triage/[appointmentId]', params: { appointmentId: ag.id } })} /> : null}
      {onWay ? <Button variant="ghost" icon="logo-whatsapp" label="Está a caminho?" onPress={() => void Linking.openURL(onWay)} /> : null}
      {late ? <Button variant="ghost" icon="person-remove-outline" label="Faltou" disabled={off} onPress={() => noShow(e)} /> : null}
    </>;
    if (step === 1) return <>
      {fila?.cobranca_estado === 'pendente' ? isExam(ag.tipo) ? examHandOff : <Button variant="secondary" icon="refresh" label={lanc ? 'Confirmar cobrança' : 'Retomar cobrança'} loading={busy === ag.id} disabled={off} onPress={() => checkin(e)} /> : null}
      <Button variant="secondary" icon="notifications-outline" label="Chamar ao Balcão" disabled={off} onPress={() => call(e, true)} />
      {lanc ? <OpenOnWeb label={`Receber ${money(saldo)} no navegador`} path="/recepcao" /> : null}
    </>;
    if (step === 2) return <>
      {lanc?.status === 'pago' ? <Badge label="Pago" tone="success" /> : null}
      {fila && ag.status !== 'em_atendimento' ? <><Button variant="secondary" icon="notifications-outline" label="Chamar" disabled={off} onPress={() => call(e, false)} /><Button icon="play" label="Atender" loading={busy === ag.id} disabled={off} onPress={() => start(e)} /></> : null}
      {ag.status === 'em_atendimento' && fila ? <Button icon="checkmark" label="Finalizar" disabled={off} onPress={() => setFinishing(e)} /> : null}
    </>;
    if (step === 3) return <>
      <Badge label="Consulta finalizada" tone="info" />{lanc?.status === 'pago' ? <Badge label="Pago" tone="success" /> : null}
      {lanc && lanc.status !== 'pago' && saldo > 0 ? <OpenOnWeb label={`Receber saldo ${money(saldo)} no navegador`} path="/recepcao" /> : null}
      <Button variant="ghost" icon="refresh" label="Retorno" onPress={() => router.push('/modules/retornos')} />
      <Button variant="ghost" icon="folder-open-outline" label="Paciente" onPress={() => router.push({ pathname: '/patients/[patientId]', params: { patientId: ag.paciente_id } })} />
      {fila && (!lanc || lanc.status === 'pago') ? <Button icon="checkmark-done" label="Concluir" disabled={off} onPress={() => conclude(e)} /> : null}
    </>;
    if (step === 4) return <Badge label={`Concluído${lanc?.forma_pagamento ? ` — ${lanc.forma_pagamento}` : ''}`} tone="success" />;
    return null;
  }

  return <ModuleScreen moduleKey="recepcao" subtitle="Check-in, balcão e andamento dos atendimentos de hoje." refreshing={refreshing} onRefresh={refresh}>
    {canReception ? <Segmented options={[{ value: 'recepcao', label: 'Recepção' }, { value: 'caixa', label: 'Caixa Diário' }]} value={current} onChange={setView} /> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando recepção…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : current === 'caixa' ? <Card style={styles.cash}>
      <View style={styles.cashHead}><Text style={styles.cashTitle}>Caixa de hoje</Text><Badge label={data?.cashOpen === null ? 'Estado indisponível' : data?.cashOpen ? 'Aberto' : 'Fechado'} tone={data?.cashOpen ? 'success' : data?.cashOpen === null ? 'warning' : 'danger'} /></View>
      <Text style={styles.note}>{data?.cashOpen === null ? 'Não foi possível confirmar o estado do caixa. Confira sua conexão e tente novamente.' : data?.cashOpen ? 'O caixa está aberto para recebimentos.' : 'Abra o Caixa Diário antes de realizar pagamentos.'}</Text>
      <Text style={styles.note}>Abertura, fechamento, recebimentos (com pagamento dividido e comprovante), sangrias e relatórios do caixa são feitos no navegador, onde há impressão e conferência completa.</Text>
      <OpenOnWeb label="Abrir Caixa Diário no navegador" path="/recepcao?tab=caixa" />
    </Card> : <>
      <View style={styles.stats}>
        <Stat label="Aguardando check-in" value={rows.filter(e => e.step === 0).length} tone="warning" onPress={() => setTab('checkin')} />
        <Stat label="No balcão" value={rows.filter(e => e.step === 1).length} tone="warning" onPress={() => setTab('balcao')} />
        <Stat label="Em atendimento" value={rows.filter(e => e.step === 2 || e.step === 3).length} tone="primary" onPress={() => setTab('atendimento')} />
        <Stat label="Concluídos" value={rows.filter(e => e.step === 4).length} tone="success" onPress={() => setTab('concluido')} />
      </View>
      <Text style={styles.note}>{avgWait === null ? 'Ninguém aguardando no momento.' : `Espera média de quem chegou: ${avgWait} min.`} Caixa {data?.cashOpen ? 'aberto' : data?.cashOpen === null ? 'com estado indisponível' : 'fechado'}.</Text>
      {finishing ? <Card style={styles.finish}>
        <Text style={styles.cashTitle}>Finalizar — {nameOf(finishing.ag.pacientes)}</Text>
        <Text style={styles.note}>Este paciente precisa retornar?</Text>
        <View style={styles.days}>{returnDays.map(d => <Pressable key={d} accessibilityRole="button" accessibilityLabel={`Retorno em ${d === 180 ? '6 meses' : `${d} dias`}`} disabled={busy !== null} onPress={() => finish(finishing, d)} style={({ pressed }) => [styles.day, pressed && styles.pressed]}><Text style={styles.dayText}>{d === 180 ? '6 meses' : `${d} dias`}</Text></Pressable>)}</View>
        <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={busy !== null} onPress={() => setFinishing(null)} /><Button label="Sem retorno" loading={busy === finishing.ag.id} onPress={() => finish(finishing, null)} /></View>
      </Card> : null}
      <Chips options={tabs} value={tab} onChange={setTab} />
      <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Paciente, médico ou horário" />
      {!shown.length ? <StateView icon="people-outline" title={rows.length ? 'Nenhum paciente neste filtro' : 'Nenhum agendamento hoje'} message={rows.length ? 'Troque o filtro ou limpe a busca.' : 'Os agendamentos do dia aparecerão aqui.'} /> :
        <Section title={`${shown.length} paciente(s)`}>{shown.map(e => {
          const info = e.ag.status === 'faltou' ? { label: 'Faltou', tone: 'neutral' as Tone } : stepInfo[e.step] ?? { label: e.ag.status, tone: 'neutral' as Tone };
          const waited = e.fila?.horario_chegada && e.step >= 1 && e.step <= 2 && e.ag.status !== 'em_atendimento' ? Math.max(0, Math.floor((Date.now() - new Date(e.fila.horario_chegada).getTime()) / 60000)) : null;
          return <View key={e.ag.id} style={styles.item}>
            <ListRow title={nameOf(e.ag.pacientes)} subtitle={[e.ag.medicos?.nome, e.ag.tipo].filter(Boolean).join(' · ') || null} tone={info.tone}
              meta={[timeLabel(e.ag.hora_inicio), waited !== null ? `aguardando há ${waited} min` : null, e.ag.id === nextId ? 'Próximo a chamar' : null].filter(Boolean).join(' · ')}
              right={<Badge label={info.label} tone={info.tone} />} />
            <View style={styles.actions}>{actions(e)}</View>
          </View>;
        })}</Section>}
      <Card style={styles.cash}><Text style={styles.note}>Recebimentos, encaixes (paciente sem agendamento) e comprovantes ficam no navegador; aqui você faz check-in, chamadas e o andamento dos atendimentos.</Text><OpenOnWeb path="/recepcao" /></Card>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }, note: { color: colors.muted, fontSize: 11, lineHeight: 17, marginVertical: 6 },
  item: { marginBottom: 6 }, actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8 },
  cash: { marginTop: 14, gap: 6 }, cashHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, cashTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  finish: { marginVertical: 10 }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, day: { minWidth: 78, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background }, dayText: { color: colors.primary, fontSize: 12, fontWeight: '700' }, pressed: { opacity: 0.72 },
});
