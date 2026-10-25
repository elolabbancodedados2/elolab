import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError, parseDateBR } from '../../lib/format';
import { db, type Db, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Status = 'active' | 'maintenance' | 'unavailable' | 'retired';
type Asset = { id: string; room_id: string | null; name: string; category: string; model: string | null; serial_number: string | null; asset_tag: string | null; warranty_until: string | null; calibration_due: string | null; maintenance_interval_days: number | null; responsible_user_id: string | null; status: Status; block_room_when_unavailable: boolean; updated_at: string };
type Order = { id: string; asset_id: string; kind: string; status: 'open' | 'in_progress' | 'completed' | 'cancelled'; priority: string; title: string; description: string | null; due_on: string | null; assigned_to: string | null; completion_note: string | null; updated_at: string };
type Doc = { id: string; asset_id: string; file_name: string; byte_size: number };
type Data = { assets: Asset[]; orders: Order[]; documents: Doc[]; rooms: { id: string; nome: string }[]; profiles: { id: string; nome: string }[]; canManageAssets: boolean; canMaintain: boolean; canOpenOrders: boolean };
type Indicator = 'vencida' | 'em30' | 'manutencao' | 'operacional';
type OrderForm = { asset: Asset; kind: string; title: string; priority: string; due: string; description: string };

const categories: Record<string, string> = { clinical: 'Assistencial', diagnostic: 'Diagnóstico', it: 'Informática', facility: 'Infraestrutura', other: 'Outro' };
const statuses: Record<Status, { label: string; tone: Tone }> = { active: { label: 'Em operação', tone: 'success' }, maintenance: { label: 'Em manutenção', tone: 'warning' }, unavailable: { label: 'Indisponível', tone: 'danger' }, retired: { label: 'Aposentado', tone: 'neutral' } };
const kinds: Record<string, string> = { preventive: 'Preventiva', corrective: 'Corretiva', calibration: 'Calibração', inspection: 'Inspeção' };
const orderStatus: Record<Order['status'], { label: string; tone: Tone }> = { open: { label: 'Aberta', tone: 'warning' }, in_progress: { label: 'Em andamento', tone: 'primary' }, completed: { label: 'Concluída', tone: 'success' }, cancelled: { label: 'Cancelada', tone: 'neutral' } };
const priorities: Record<string, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const toOptions = (r: Record<string, string>) => Object.entries(r).map(([value, label]) => ({ value, label }));
const daysBetween = (today: string, date: string) => Math.round((Date.parse(`${date.slice(0, 10)}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);

/** Calls the same edge function as the web and surfaces its JSON error message. */
async function invoke(client: Db, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke('patrimonio-equipamentos', { body });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function EquipmentScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [calib, setCalib] = useState<Record<string, string>>({});
  const [form, setForm] = useState<OrderForm | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => clinicId ? invoke(client, { action: 'list' }) as Promise<Data> : undefined, [clinicId]);
  const d: Data = data ?? { assets: [], orders: [], documents: [], rooms: [], profiles: [], canManageAssets: false, canMaintain: false, canOpenOrders: false };
  const roomName = new Map(d.rooms.map(r => [r.id, r.nome]));
  const person = new Map(d.profiles.map(p => [p.id, p.nome]));
  const ordersOf = (id: string) => d.orders.filter(o => o.asset_id === id);

  // Next deadline: calibration or open order due date, whichever comes first (same rule as the web).
  const deadline = (a: Asset) => {
    const dates = [a.calibration_due, ...ordersOf(a.id).filter(o => o.due_on && (o.status === 'open' || o.status === 'in_progress')).map(o => o.due_on)].filter(Boolean).map(v => (v as string).slice(0, 10)).sort();
    if (!dates[0] || a.status === 'retired') return { date: null as string | null, days: null as number | null, urgency: 'sem_prazo' };
    const days = daysBetween(today, dates[0]);
    return { date: dates[0], days, urgency: days < 0 ? 'vencida' : days <= 30 ? 'em30' : 'futura' };
  };
  const live = d.assets.filter(a => a.status !== 'retired');
  const openOrders = d.orders.filter(o => o.status === 'open' || o.status === 'in_progress').length;
  const matches = (a: Asset) => !indicator || (indicator === 'manutencao' ? a.status === 'maintenance' : indicator === 'operacional' ? a.status === 'active' : a.status !== 'retired' && deadline(a).urgency === indicator);
  const q = search.trim().toLowerCase();
  const shown = d.assets.filter(a => matches(a) && (!q || [a.name, a.asset_tag, a.serial_number, a.model, roomName.get(a.room_id ?? ''), categories[a.category]].some(v => (v ?? '').toLowerCase().includes(q))))
    .sort((a, b) => (deadline(a).date ?? '9999-99-99').localeCompare(deadline(b).date ?? '9999-99-99') || a.name.localeCompare(b.name, 'pt-BR'));

  async function act(id: string, body: Record<string, unknown>, success: string) {
    if (busy) return false;
    setBusy(id); setFeedback(null);
    try { await invoke(db, body); setFeedback({ message: success }); return true; } catch (err) { setFeedback({ message: friendlyError(err, 'Operação não concluída'), error: true }); return false; } finally { setBusy(null); reload(); }
  }
  // Optimistic concurrency: the edge function rejects a stale expected_updated_at.
  const patch = (a: Asset, values: Record<string, unknown>, success: string) => void act(a.id, { action: 'update_asset', asset_id: a.id, expected_updated_at: a.updated_at, patch: values }, success);
  const retire = (a: Asset) => Alert.alert('Aposentar equipamento', `Aposentar "${a.name}"? Ele deixa de contar como operacional e de receber ordens.`, [{ text: 'Voltar', style: 'cancel' }, { text: 'Aposentar', style: 'destructive', onPress: () => patch(a, { status: 'retired' }, 'Equipamento aposentado') }]);

  function saveCalibration(a: Asset) {
    const raw = (calib[a.id] ?? (a.calibration_due ? dateLabel(a.calibration_due.slice(0, 10)) : '')).trim();
    const iso = raw ? parseDateBR(raw) : null;
    if (raw && !iso) return setFeedback({ message: 'Use a data no formato DD/MM/AAAA.', error: true });
    patch(a, { calibration_due: iso }, 'Prazo de calibração atualizado');
  }

  function createOrder() {
    if (!form) return;
    const due = form.due.trim() ? parseDateBR(form.due) : null;
    if (form.title.trim().length < 3) return setFeedback({ message: 'Informe um título com pelo menos 3 caracteres.', error: true });
    if (form.due.trim() && !due) return setFeedback({ message: 'Use a data no formato DD/MM/AAAA.', error: true });
    void act('order', { action: 'create_order', order: { asset_id: form.asset.id, kind: form.kind, title: form.title.trim(), description: form.description.trim(), due_on: due, assigned_to: null, priority: form.priority } }, 'Ordem de serviço aberta').then(ok => { if (ok) setForm(null); });
  }

  async function openDoc(id: string) {
    try { const res = await invoke(db, { action: 'document_url', document_id: id }); await Linking.openURL(res.url); } catch (err) { setFeedback({ message: friendlyError(err, 'Documento indisponível.'), error: true }); }
  }

  return <ModuleScreen moduleKey="patrimonio" subtitle={d.assets.length ? [`${d.assets.length} equipamento(s)`, openOrders ? `${openOrders} ordem(ns) aberta(s)` : null].filter(Boolean).join(' · ') : 'Ativos, calibrações, ordens de serviço e documentos'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {form ? <Card style={styles.form}>
      <Text style={styles.title}>Abrir ordem de serviço</Text>
      <Text style={styles.note}>{form.asset.name}{form.asset.asset_tag ? ` · ${form.asset.asset_tag}` : ''}</Text>
      <Chips label="Tipo" options={toOptions(kinds)} value={form.kind} onChange={kind => setForm({ ...form, kind })} />
      <Field label="Título *" value={form.title} onChangeText={title => setForm({ ...form, title })} maxLength={160} />
      <Chips label="Prioridade" options={toOptions(priorities)} value={form.priority} onChange={priority => setForm({ ...form, priority })} />
      <Field label="Prazo" value={form.due} onChangeText={due => setForm({ ...form, due })} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" hint="Opcional. O responsável é definido no navegador." />
      <Field label="Descrição" value={form.description} onChangeText={description => setForm({ ...form, description })} multiline maxLength={2000} />
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setForm(null)} /><Button icon="add" label="Abrir ordem" loading={busy === 'order'} onPress={createOrder} /></View>
    </Card> : null}
    {loading ? <StateView loading title="Carregando patrimônio…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o patrimônio" message={`Nenhuma alteração será feita até confirmar o estado atual dos equipamentos. ${error}`} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Manutenção vencida" value={live.filter(a => deadline(a).urgency === 'vencida').length} tone="danger" onPress={() => setIndicator(i => i === 'vencida' ? null : 'vencida')} />
        <Stat label="Vence em 30 dias" value={live.filter(a => deadline(a).urgency === 'em30').length} tone="warning" onPress={() => setIndicator(i => i === 'em30' ? null : 'em30')} />
        <Stat label="Em manutenção" value={d.assets.filter(a => a.status === 'maintenance').length} tone="primary" onPress={() => setIndicator(i => i === 'manutencao' ? null : 'manutencao')} />
        <Stat label="Operacionais" value={d.assets.filter(a => a.status === 'active').length} tone="success" onPress={() => setIndicator(i => i === 'operacional' ? null : 'operacional')} />
      </View>
      <Field label="Buscar equipamentos" value={search} onChangeText={setSearch} placeholder="Nome, patrimônio, sala, série…" />
      {!shown.length ? <StateView icon="cube-outline" title={d.assets.length ? 'Nenhum equipamento corresponde aos filtros' : 'Nenhum ativo patrimonial cadastrado'} message={d.assets.length ? 'Limpe a busca ou o indicador para ver todos os equipamentos.' : 'Cadastre o primeiro equipamento no navegador para acompanhar calibrações e ordens de serviço.'} actionLabel={indicator ? 'Limpar filtro' : undefined} onAction={indicator ? () => setIndicator(null) : undefined} /> :
        <Section title={`${shown.length} de ${d.assets.length} equipamento(s)`}>{shown.map(a => {
          const dl = deadline(a);
          const canAct = d.canMaintain && a.status !== 'retired';
          const docs = d.documents.filter(doc => doc.asset_id === a.id);
          const st = statuses[a.status];
          return <View key={a.id} style={styles.item}>
            <ListRow icon="construct-outline" tone={dl.urgency === 'vencida' ? 'danger' : dl.urgency === 'em30' ? 'warning' : st.tone} title={a.name}
              subtitle={[categories[a.category] ?? a.category, roomName.get(a.room_id ?? '') ?? 'Sem sala fixa', a.asset_tag].filter(Boolean).join(' · ')}
              meta={dl.date ? `Próximo prazo ${dateLabel(dl.date)} · ${dl.days! < 0 ? `vencida há ${Math.abs(dl.days!)} dia(s)` : dl.days === 0 ? 'vence hoje' : `em ${dl.days} dia(s)`}` : 'Sem prazo de manutenção'}
              right={<Badge label={st.label} tone={st.tone} />} />
            <Text style={styles.note}>Série: {a.serial_number || '—'} · Modelo: {a.model || '—'} · Responsável: {person.get(a.responsible_user_id ?? '') || 'A definir'}{'\n'}Garantia: {dateLabel(a.warranty_until)} · Calibração: {dateLabel(a.calibration_due)} · Manutenção: {a.maintenance_interval_days ? `a cada ${a.maintenance_interval_days} dias` : 'sem periodicidade'}</Text>
            {a.block_room_when_unavailable ? <Text style={styles.warn}>A sala fica bloqueada se este equipamento estiver fora de operação.</Text> : null}
            <View style={styles.actions}>
              {canAct && a.status !== 'active' ? <Button label="Marcar em operação" disabled={busy !== null} onPress={() => patch(a, { status: 'active' }, 'Equipamento em operação')} /> : null}
              {canAct && a.status === 'active' ? <><Button label="Enviar para manutenção" disabled={busy !== null} onPress={() => patch(a, { status: 'maintenance' }, 'Equipamento enviado para manutenção')} /><Button variant="secondary" label="Marcar indisponível" disabled={busy !== null} onPress={() => patch(a, { status: 'unavailable' }, 'Equipamento marcado como indisponível')} /></> : null}
              {d.canOpenOrders && a.status !== 'retired' ? <Button variant="secondary" icon="clipboard-outline" label="Abrir OS" onPress={() => { setFeedback(null); setForm({ asset: a, kind: dl.date && dl.date === a.calibration_due?.slice(0, 10) ? 'calibration' : 'preventive', title: '', priority: 'normal', due: '', description: '' }); }} /> : null}
              {canAct && d.canManageAssets ? <Button variant="ghost" label="Aposentar" disabled={busy !== null} onPress={() => retire(a)} /> : null}
            </View>
            {canAct ? <View style={styles.inline}><View style={styles.fill}><Field label="Próxima calibração" value={calib[a.id] ?? (a.calibration_due ? dateLabel(a.calibration_due.slice(0, 10)) : '')} onChangeText={v => setCalib(c => ({ ...c, [a.id]: v }))} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" /></View><Button variant="secondary" label="Atualizar prazo" disabled={busy !== null} onPress={() => saveCalibration(a)} /></View> : null}
            {docs.map(doc => <ListRow key={doc.id} icon="document-outline" title={doc.file_name} subtitle={`${(doc.byte_size / 1024).toFixed(0)} KB`} onPress={() => void openDoc(doc.id)} accessibilityLabel={`Abrir documento ${doc.file_name}`} />)}
            {ordersOf(a.id).slice(0, 5).map(o => {
              const late = Boolean(o.due_on && (o.status === 'open' || o.status === 'in_progress') && o.due_on.slice(0, 10) < today);
              return <Card key={o.id} style={[styles.order, late && styles.late]}>
                <View style={styles.orderHead}><Text style={styles.orderTitle}>{o.title} · {kinds[o.kind] ?? o.kind}</Text><Badge label={orderStatus[o.status].label} tone={orderStatus[o.status].tone} /></View>
                <Text style={styles.note}>{priorities[o.priority] ?? o.priority.toUpperCase()} · prazo {dateLabel(o.due_on ? o.due_on.slice(0, 10) : null)}{late ? ' (atrasada)' : ''} · {person.get(o.assigned_to ?? '') || 'Sem responsável'}</Text>
                {o.description ? <Text style={styles.note}>{o.description}</Text> : null}
                {o.status === 'open' && d.canMaintain ? <Button label="Iniciar serviço" loading={busy === o.id} disabled={busy !== null} onPress={() => void act(o.id, { action: 'update_order', work_order_id: o.id, expected_updated_at: o.updated_at, patch: { status: 'in_progress' } }, 'Serviço iniciado')} /> : null}
                {o.status === 'in_progress' && d.canMaintain ? <><Field label="Serviço executado *" value={notes[o.id] || ''} onChangeText={v => setNotes(n => ({ ...n, [o.id]: v }))} maxLength={2000} multiline /><Button label="Concluir" loading={busy === o.id} disabled={busy !== null || (notes[o.id] || '').trim().length < 3} onPress={() => void act(o.id, { action: 'update_order', work_order_id: o.id, expected_updated_at: o.updated_at, patch: { status: 'completed', completion_note: notes[o.id] } }, 'Ordem concluída')} /></> : null}
                {o.completion_note ? <Text style={styles.note}>Concluído: {o.completion_note}</Text> : null}
              </Card>;
            })}
          </View>;
        })}</Section>}
      <Card style={styles.handoff}><Text style={styles.note}>Cadastro de novos equipamentos, anexos (PDF ou imagem), escolha de responsável e histórico de auditoria ficam no navegador.</Text><OpenOnWeb path="/patrimonio-equipamentos" /></Card>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }, item: { marginBottom: 12 }, note: { color: colors.muted, fontSize: 11, lineHeight: 17, marginVertical: 4 }, warn: { color: colors.warning, fontSize: 11, fontWeight: '700', marginVertical: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6 }, inline: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, fill: { flex: 1 },
  order: { marginTop: 8, padding: 12, gap: 4 }, late: { borderColor: colors.danger, backgroundColor: colors.dangerSoft }, orderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, orderTitle: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: '700' },
  form: { marginBottom: 10 }, title: { color: colors.ink, fontSize: 15, fontWeight: '800' }, handoff: { marginTop: 18, gap: 8 },
});
