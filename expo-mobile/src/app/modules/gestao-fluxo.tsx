import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Segmented, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Tab = 'salas' | 'espera';
type Room = { id: string; nome: string; tipo: string | null; status: string; capacidade: number | null; setor: string | null; andar: string | null; numero_cama: string | null; medico_responsavel: string | null };
type Occupation = { id: string; sala_id: string; status: string; agendamentos: { data: string | null; pacientes: { nome: string | null; nome_social: string | null } | null; medicos: { nome: string | null; especialidade: string | null } | null } | null };
type Wait = { id: string; paciente_id: string; status: string | null; prioridade: string | null; especialidade: string | null; motivo: string | null; preferencia_horario: string | null; data_cadastro: string | null; pacientes: { nome: string | null; nome_social: string | null; telefone: string | null } | null; medicos: { nome: string | null } | null };

const roomStatus: Record<string, { label: string; tone: Tone }> = { disponivel: { label: 'Disponível', tone: 'success' }, ocupado: { label: 'Ocupado', tone: 'danger' }, manutencao: { label: 'Manutenção', tone: 'warning' }, limpeza: { label: 'Limpeza', tone: 'info' }, reservada: { label: 'Reservada', tone: 'info' } };
const roomType: Record<string, string> = { consultorio: 'Consultório', exame: 'Sala de Exames', procedimento: 'Sala de Procedimentos', triagem: 'Triagem', espera: 'Sala de Espera', leito_enfermaria: 'Leito — Enfermaria', leito_apartamento: 'Leito — Apartamento', leito_uti: 'Leito — UTI', leito_observacao: 'Leito — Observação' };
const waitStatus: Record<string, { label: string; tone: Tone }> = { aguardando: { label: 'Aguardando', tone: 'warning' }, notificado: { label: 'Notificado', tone: 'primary' }, confirmado: { label: 'Confirmado', tone: 'success' }, agendado: { label: 'Agendado', tone: 'primary' }, desistiu: { label: 'Desistiu', tone: 'neutral' } };
const priorityInfo: Record<string, { label: string; tone: Tone; weight: number }> = { urgente: { label: 'Urgente', tone: 'danger', weight: 0 }, preferencial: { label: 'Preferencial', tone: 'info', weight: 1 }, normal: { label: 'Normal', tone: 'neutral', weight: 2 } };
const prefLabel: Record<string, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const transitions: Record<string, string[]> = { aguardando: ['notificado', 'desistiu'], notificado: ['confirmado', 'desistiu'], confirmado: ['desistiu'] };
const activeWait = ['aguardando', 'notificado', 'confirmado'];
const waitFilters = [{ value: 'aguardando', label: 'Aguardando' }, { value: 'notificado', label: 'Notificado' }, { value: 'confirmado', label: 'Confirmado' }, { value: 'todos', label: 'Todos' }];
const normalize = (v: string | null | undefined) => (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nameOf = (p: { nome: string | null; nome_social: string | null } | null | undefined) => p?.nome_social || p?.nome || 'Desconhecido';

function waitDays(date: string | null, today: string) {
  if (!date) return 0;
  return Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date.slice(0, 10)}T12:00:00Z`)) / 86400000));
}
function whatsapp(phone: string | null | undefined, message: string) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`}?text=${encodeURIComponent(message)}`;
}

export default function FlowScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const isAdmin = Boolean(profile?.roles.includes('admin'));
  const [tab, setTab] = useState<Tab>('salas');
  const [search, setSearch] = useState('');
  const [waitFilter, setWaitFilter] = useState('aguardando');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    if (tab === 'salas') {
      const [rooms, occ] = await Promise.all([
        client.from('salas').select('id, nome, tipo, status, capacidade, setor, andar, numero_cama, medico_responsavel').eq('clinica_id', clinicId).order('nome', { ascending: true }),
        client.from('fila_atendimento').select('id, sala_id, status, agendamento_id, agendamentos(id, data, paciente_id, medico_id, pacientes(id, nome, nome_social), medicos(id, nome, crm, especialidade))')
          .in('status', ['em_atendimento', 'chamado', 'aguardando']).not('sala_id', 'is', null).eq('clinica_id', clinicId),
      ]);
      return { tab, rooms: (must(rooms) ?? []) as Room[], occ: (must(occ) ?? []) as Occupation[], waits: [] as Wait[] };
    }
    const waits = must(await client.from('lista_espera').select('*, pacientes(nome, nome_social, cpf, telefone, email), medicos(nome, crm, especialidade)').eq('clinica_id', clinicId).order('data_cadastro', { ascending: true }));
    return { tab, rooms: [] as Room[], occ: [] as Occupation[], waits: (waits ?? []) as Wait[] };
  }, [clinicId, tab]);

  const fresh = data?.tab === tab;
  const occOf = (roomId: string) => (data?.occ ?? []).filter(o => o.sala_id === roomId);
  const effective = (room: Room) => { const o = occOf(room.id); return o.some(i => i.status === 'em_atendimento') ? 'ocupado' : o.length ? 'reservada' : room.status; };

  async function setRoomStatus(room: Room, next: string) {
    if (!clinicId || busy) return;
    // Same guard as the web: a room linked to an active queue entry cannot be released.
    if (occOf(room.id).length && next !== 'ocupado') return setFeedback({ message: 'Não é possível liberar esta sala enquanto houver paciente vinculado. Finalize ou transfira o atendimento na Fila antes.', error: true });
    setBusy(room.id); setFeedback(null);
    try {
      const row = must(await db.from('salas').update({ status: next }).eq('id', room.id).eq('clinica_id', clinicId).eq('status', room.status).select('id').maybeSingle());
      if (!row) throw new Error('O status da sala mudou ou o atendimento foi atualizado por outra pessoa. Atualize a tela antes de tentar novamente.');
      setFeedback({ message: `${room.nome} → ${roomStatus[next]?.label ?? next}` });
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao atualizar o estado da sala.'), error: true }); } finally { setBusy(null); reload(); }
  }

  async function setWaitStatus(item: Wait, next: string) {
    if (!clinicId || busy) return;
    const expected = item.status || 'aguardando';
    if (!transitions[expected]?.includes(next)) return setFeedback({ message: 'Esta mudança de status não é permitida. Atualize a lista e tente novamente.', error: true });
    setBusy(item.id); setFeedback(null);
    try {
      const row = must(await db.from('lista_espera').update({ status: next }).eq('id', item.id).eq('clinica_id', clinicId).eq('status', expected).select('id').maybeSingle());
      if (!row) throw new Error('O status foi alterado por outro fluxo. Atualize a lista antes de tentar novamente.');
      setFeedback({ message: 'Status atualizado!' });
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao atualizar status'), error: true }); } finally { setBusy(null); reload(); }
  }

  function giveUp(item: Wait) {
    Alert.alert('Registrar desistência?', `${nameOf(item.pacientes)} será marcado como desistente e permanecerá no histórico. O pedido deixará de contar como ativo.`, [
      { text: 'Voltar', style: 'cancel' }, { text: 'Confirmar desistência', style: 'destructive', onPress: () => void setWaitStatus(item, 'desistiu') },
    ]);
  }

  function remove(item: Wait) {
    Alert.alert('Remover da lista de espera?', 'O item será removido permanentemente da lista de espera.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => void (async () => {
        setBusy(item.id); setFeedback(null);
        try {
          const row = must(await db.from('lista_espera').delete().eq('id', item.id).eq('clinica_id', clinicId).select('id').maybeSingle());
          if (!row) throw new Error('Este registro não existe mais ou você não tem permissão para removê-lo.');
          setFeedback({ message: 'Removido da lista de espera!' });
        } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao remover'), error: true }); } finally { setBusy(null); reload(); }
      })() },
    ]);
  }

  const q = normalize(search.trim());
  const rooms = (fresh ? data?.rooms ?? [] : []).filter(r => !q || [r.nome, r.setor, r.andar, r.numero_cama, roomType[r.tipo ?? '']].some(v => normalize(v).includes(q)));
  const allRooms = fresh ? data?.rooms ?? [] : [];
  const waits = fresh ? data?.waits ?? [] : [];
  const sortWait = (a: Wait, b: Wait) => (priorityInfo[a.prioridade ?? 'normal']?.weight ?? 2) - (priorityInfo[b.prioridade ?? 'normal']?.weight ?? 2) || String(a.data_cadastro ?? '').localeCompare(String(b.data_cadastro ?? ''));
  const qDigits = q.replace(/\D/g, '');
  const shownWaits = waits.filter(w => (waitFilter === 'todos' || w.status === waitFilter) && (!q || normalize(nameOf(w.pacientes)).includes(q) || Boolean(qDigits && (w.pacientes?.telefone ?? '').replace(/\D/g, '').includes(qDigits)))).sort(sortWait);
  const actives = waits.filter(w => activeWait.includes(w.status || 'aguardando'));
  const nextUp = waits.filter(w => (w.status || 'aguardando') === 'aguardando').sort(sortWait)[0];

  return <ModuleScreen moduleKey="gestao-fluxo" subtitle={tab === 'salas' ? 'Ocupação e estado das salas e leitos.' : 'Pacientes aguardando vaga, por prioridade.'} refreshing={refreshing} onRefresh={refresh}>
    <Segmented options={[{ value: 'salas', label: 'Salas' }, { value: 'espera', label: 'Lista de Espera' }]} value={tab} onChange={value => { setTab(value); setFeedback(null); setSearch(''); }} />
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Field label="Buscar" value={search} onChangeText={setSearch} placeholder={tab === 'salas' ? 'Nome, setor, andar…' : 'Nome ou telefone do paciente'} />
    {error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : loading || !fresh ? <StateView loading title="Carregando…" /> : tab === 'salas' ? <>
      <View style={styles.stats}>{(['disponivel', 'ocupado', 'reservada', 'limpeza', 'manutencao'] as const).map(s => <Stat key={s} label={roomStatus[s].label} value={allRooms.filter(r => effective(r) === s).length} tone={roomStatus[s].tone} />)}</View>
      {!rooms.length ? <StateView icon="business-outline" title={allRooms.length ? 'Nenhuma sala encontrada' : 'Nenhuma sala cadastrada'} message={allRooms.length ? 'Limpe a busca para ver todas as salas.' : 'Cadastre salas e leitos no navegador.'} /> :
        <Section title={`${rooms.length} sala(s)`}>{rooms.map(room => {
          const state = effective(room);
          const occ = occOf(room.id);
          return <View key={room.id} style={styles.item}>
            <ListRow icon={room.tipo?.startsWith('leito_') ? 'bed-outline' : 'business-outline'} tone={roomStatus[state]?.tone ?? 'neutral'} title={room.nome}
              subtitle={[roomType[room.tipo ?? ''] ?? room.tipo, room.setor, room.andar ? `Andar ${room.andar}` : null].filter(Boolean).join(' · ') || null}
              meta={`${occ.length} vínculos ativos · capacidade ${room.capacidade && room.capacidade > 0 ? room.capacidade : 1}`} right={<Badge label={roomStatus[state]?.label ?? state} tone={roomStatus[state]?.tone} />} />
            {occ.map(o => {
              const old = o.agendamentos?.data && o.agendamentos.data < today ? dateLabel(o.agendamentos.data) : null;
              return <Text key={o.id} style={styles.occ}>{nameOf(o.agendamentos?.pacientes)}{o.agendamentos?.medicos?.nome ? ` · ${o.agendamentos.medicos.nome}` : ''} — {o.status === 'em_atendimento' ? 'Em atendimento' : o.status === 'chamado' ? 'Paciente chamado' : 'Aguardando na fila'}{old ? `\nRegistro de ${old}; confira a fila antes de liberar a sala.` : ''}</Text>;
            })}
            <View style={styles.actions}>
              {state === 'disponivel' ? <Button label="Ocupar" loading={busy === room.id} disabled={busy !== null} onPress={() => void setRoomStatus(room, 'ocupado')} /> : null}
              {state === 'ocupado' && !occ.length ? <Button variant="secondary" label="Liberar" loading={busy === room.id} disabled={busy !== null} onPress={() => void setRoomStatus(room, 'limpeza')} /> : null}
              {state === 'manutencao' ? <Button variant="secondary" label="Liberar" loading={busy === room.id} disabled={busy !== null} onPress={() => void setRoomStatus(room, 'disponivel')} /> : null}
              {occ.length ? <Button variant="ghost" icon="people-outline" label="Ver na fila" onPress={() => router.push('/(tabs)/care')} /> : null}
              {state === 'limpeza' ? <Button variant="ghost" icon="sparkles-outline" label="Inspecionar" onPress={() => router.push('/modules/higiene-salas')} /> : null}
            </View>
          </View>;
        })}</Section>}
      <Card style={styles.handoff}><Text style={styles.note}>Cadastro e edição de salas e leitos (equipamentos, horários, cores) ficam no navegador.</Text><OpenOnWeb path="/gestao-fluxo" /></Card>
    </> : <>
      <View style={styles.stats}>
        <Stat label="Ativos" value={actives.length} tone="primary" />
        <Stat label="Urgentes ativos" value={actives.filter(w => w.prioridade === 'urgente').length} tone="danger" />
        <Stat label="Acima de 30 dias" value={actives.filter(w => waitDays(w.data_cadastro, today) > 30).length} tone="warning" />
      </View>
      {nextUp ? <Card style={styles.next}><Text style={styles.eyebrow}>Próximo a chamar</Text><Text style={styles.nextName}>{nameOf(nextUp.pacientes)}</Text><Text style={styles.note}>{[nextUp.especialidade, `${waitDays(nextUp.data_cadastro, today)} dia(s) de espera`].filter(Boolean).join(' · ')}</Text>
        <View style={styles.actions}><Button label="Marcar notificado" loading={busy === nextUp.id} disabled={busy !== null} onPress={() => void setWaitStatus(nextUp, 'notificado')} /></View></Card> : null}
      <Chips label="Status" options={waitFilters} value={waitFilter} onChange={setWaitFilter} />
      {!shownWaits.length ? <StateView icon="hourglass-outline" title="Nenhum paciente nesta lista" message={waits.length ? 'Troque o filtro de status ou limpe a busca.' : 'Os pedidos de vaga aparecerão aqui.'} /> :
        <Section title={`${shownWaits.length} pedido(s)`}>{shownWaits.map(item => {
          const st = item.status || 'aguardando';
          const pr = priorityInfo[item.prioridade ?? 'normal'];
          const name = nameOf(item.pacientes);
          const wa = whatsapp(item.pacientes?.telefone, `Olá, ${name}! Aqui é da clínica. Surgiu uma vaga${item.especialidade ? ` em ${item.especialidade}` : ''} e você está na nossa lista de espera. Podemos agendar?`);
          return <View key={item.id} style={styles.item}>
            <ListRow title={name} subtitle={[item.especialidade, item.medicos?.nome, item.preferencia_horario ? prefLabel[item.preferencia_horario] ?? item.preferencia_horario : null, item.motivo].filter(Boolean).join(' · ') || null}
              meta={`${waitStatus[st]?.label ?? st} · ${waitDays(item.data_cadastro, today)} dia(s) de espera · desde ${dateLabel(item.data_cadastro)}`}
              right={<Badge label={pr?.label ?? `Prioridade desconhecida (${item.prioridade})`} tone={pr?.tone ?? 'warning'} />} />
            <View style={styles.actions}>
              {wa ? <Button variant="ghost" icon="logo-whatsapp" label="WhatsApp" onPress={() => void Linking.openURL(wa)} /> : null}
              {st === 'aguardando' ? <Button variant="secondary" label="Marcar notificado" loading={busy === item.id} disabled={busy !== null} onPress={() => void setWaitStatus(item, 'notificado')} /> : null}
              {st === 'notificado' ? <Button label="Confirmar" loading={busy === item.id} disabled={busy !== null} onPress={() => void setWaitStatus(item, 'confirmado')} /> : null}
              {st === 'confirmado' ? <OpenOnWeb label="Agendar no navegador" path={`/agenda?espera=${encodeURIComponent(item.id)}&paciente=${encodeURIComponent(item.paciente_id)}`} /> : null}
              {activeWait.includes(st) ? <Button variant="ghost" label="Desistiu" disabled={busy !== null} onPress={() => giveUp(item)} /> : null}
              {isAdmin ? <Button variant="danger" label="Remover" disabled={busy !== null} onPress={() => remove(item)} /> : null}
            </View>
          </View>;
        })}</Section>}
      <Card style={styles.handoff}><Text style={styles.note}>“Marcar notificado” altera o status; não envia mensagem ao paciente. Para incluir um paciente na lista ou agendar a vaga, use o navegador.</Text><OpenOnWeb path="/gestao-fluxo?tab=espera" /></Card>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }, item: { marginBottom: 6 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  occ: { color: colors.ink, fontSize: 11, lineHeight: 16, paddingLeft: 49, paddingTop: 6 }, handoff: { marginTop: 18, gap: 10 }, note: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  next: { marginTop: 8, marginBottom: 12, borderColor: colors.primary }, eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, nextName: { color: colors.ink, fontSize: 17, fontWeight: '800', marginVertical: 4 },
});
