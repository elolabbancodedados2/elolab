import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppRole } from '../../auth/AuthContext';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/tokens';

type WorkItem = {
  id: string;
  filaId: string | null;
  queuePosition: number | null;
  agendamento_id: string;
  tipo: string | null;
  tipoExame: string | null;
  horario: string | null;
  status: string | null;
  prioridade: string | null;
  paciente: string;
  medico: string;
  salaId: string | null;
};

type QueueRow = {
  id: string;
  agendamento_id: string;
  posicao: number;
  horario_chegada: string | null;
  status: string | null;
  prioridade: string | null;
  sala_id: string | null;
  agendamentos: {
    paciente_id: string | null;
    data: string | null;
    hora_inicio: string | null;
    medico_id: string | null;
    sala_id: string | null;
    tipo: string | null;
    observacoes: string | null;
    pacientes: { nome: string | null; nome_social: string | null } | null;
    medicos: { nome: string | null } | null;
  } | null;
};

type TriageRow = {
  id: string;
  hora_inicio: string | null;
  status: string;
  pacientes: { nome: string | null; nome_social: string | null } | null;
  medicos: { nome: string | null } | null;
};

type TriageCandidate = { id: string; hora_inicio: string | null; exige_triagem: boolean | null; status: string | null };

type Panel = 'fila' | 'triagem';
const queueRoles: AppRole[] = ['admin', 'recepcao', 'enfermagem', 'medico'];
const triageRoles: AppRole[] = ['admin', 'medico', 'enfermagem'];

function todayAtClinic() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function timeLabel(value: string | null) {
  if (!value) return 'Horário não informado';
  return value.includes('T') ? value.slice(11, 16) : value.slice(0, 5);
}

function priorityOrder(value: string | null) {
  return value === 'urgente' ? 0 : value === 'preferencial' ? 1 : 2;
}

export default function CareScreen() {
  const { profile, profileLoading } = useAuth();
  const clinicId = profile?.clinicaId;
  const canViewQueue = Boolean(profile?.roles.some(role => queueRoles.includes(role)));
  const canViewTriage = Boolean(profile?.roles.some(role => triageRoles.includes(role)));
  const doctorOnly = Boolean(profile?.roles.includes('medico')
    && !profile.roles.some(role => ['admin', 'recepcao', 'enfermagem'].includes(role)));
  const [panel, setPanel] = useState<Panel>('fila');
  const canLoadPanel = panel === 'fila' ? canViewQueue : canViewTriage;
  const [queue, setQueue] = useState<WorkItem[]>([]);
  const [triage, setTriage] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busyQueueId, setBusyQueueId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState<WorkItem | null>(null);
  const transitionLock = useRef(false);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(useCallback(() => {
    setRefreshKey(value => value + 1);
  }, []));

  useEffect(() => {
    if (panel === 'triagem' && !canViewTriage) setPanel('fila');
  }, [panel, canViewTriage]);

  useEffect(() => {
    if (!clinicId || !supabase || !canLoadPanel) {
      setQueue([]);
      setTriage([]);
      setLoading(false);
      setError(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(false);
    setActionFeedback(null);
    setQueue([]);
    setTriage([]);
    void (async () => {
      if (panel === 'fila') {
        let doctorId: string | null = null;
        if (doctorOnly) {
          // This RPC is defined in SQL but is newer than the generated client types.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabase as any;
          const { data, error: doctorError } = await db.rpc('buscar_medico_atual');
          if (doctorError) throw doctorError;
          doctorId = data?.[0]?.id ?? null;
          if (!doctorId) throw new Error('Não foi possível localizar o perfil profissional.');
        }
        const { data, error: queryError } = await supabase
          .from('fila_atendimento')
          .select('id, agendamento_id, posicao, horario_chegada, status, prioridade, sala_id, agendamentos(paciente_id, data, hora_inicio, medico_id, sala_id, tipo, observacoes, pacientes(nome, nome_social), medicos(nome))')
          .eq('clinica_id', clinicId)
          .neq('status', 'finalizado')
          .order('posicao', { ascending: true })
          .limit(100);
        if (queryError) throw queryError;
        const currentDay = todayAtClinic();
        const currentQueue = ((data ?? []) as unknown as QueueRow[])
          .filter(row => row.agendamentos?.data === currentDay
            && (!doctorId || row.agendamentos?.medico_id === doctorId))
          .map(row => ({
            id: row.id,
            filaId: row.id,
            queuePosition: row.posicao,
            agendamento_id: row.agendamento_id,
            tipo: row.agendamentos?.tipo ?? null,
            tipoExame: row.agendamentos?.tipo === 'exame' || row.agendamentos?.tipo === 'exames' ? row.agendamentos?.observacoes ?? null : null,
            horario: row.agendamentos?.hora_inicio ?? row.horario_chegada,
            status: row.status,
            prioridade: row.prioridade,
            paciente: row.agendamentos?.pacientes?.nome_social || row.agendamentos?.pacientes?.nome || 'Paciente',
            medico: row.agendamentos?.medicos?.nome || 'Profissional não informado',
            salaId: row.agendamentos?.sala_id ?? row.sala_id,
          }))
          .sort((a, b) => priorityOrder(a.prioridade) - priorityOrder(b.prioridade)
            || (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
        if (active) setQueue(currentQueue);
      } else {
        let doctorId: string | null = null;
        if (doctorOnly) {
          // This RPC is defined in SQL but is newer than the generated client types.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabase as any;
          const { data, error: doctorError } = await db.rpc('buscar_medico_atual');
          if (doctorError) throw doctorError;
          doctorId = data?.[0]?.id ?? null;
          if (!doctorId) throw new Error('Não foi possível localizar o perfil profissional.');
        }
        const today = todayAtClinic();
        const startOfDay = new Date(`${today}T00:00:00-03:00`);
        const nextDay = new Date(startOfDay);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        const { data: queueRows, error: queueError } = await supabase
          .from('fila_atendimento')
          .select('agendamento_id')
          .eq('clinica_id', clinicId)
          .in('status', ['aguardando', 'chamado', 'em_atendimento'])
          .gte('horario_chegada', startOfDay.toISOString())
          .lt('horario_chegada', nextDay.toISOString())
          .limit(100);
        if (queueError) throw queueError;
        const appointmentIds = [...new Set((queueRows ?? []).map(row => row.agendamento_id).filter(Boolean))];
        if (appointmentIds.length === 0) {
          if (active) setTriage([]);
          return;
        }

        // Use the same clinic scope, active-check-in requirement, status set,
        // and triage-completion RPC as the web triage queue.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any;
        let candidatesQuery = db.from('agendamentos')
          .select('id, hora_inicio, exige_triagem, status')
          .eq('clinica_id', clinicId)
          .eq('data', today)
          .in('id', appointmentIds)
          .in('status', ['agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'pago'])
          .limit(100);
        if (doctorId) candidatesQuery = candidatesQuery.eq('medico_id', doctorId);
        const { data: candidateData, error: candidateError } = await candidatesQuery;
        if (candidateError) throw candidateError;
        const candidates = (candidateData ?? []) as TriageCandidate[];
        const candidateIds = candidates.filter(row => row.exige_triagem !== false).map(row => row.id);
        if (candidateIds.length === 0) {
          if (active) setTriage([]);
          return;
        }
        const { data: completedRows, error: completedError } = await db.rpc('listar_agendamentos_com_triagem', {
          p_agendamento_ids: candidateIds,
        });
        if (completedError) throw completedError;
        const completedIds = new Set((completedRows ?? []).map((row: { agendamento_id: string }) => row.agendamento_id));
        const pendingIds = candidateIds.filter(id => !completedIds.has(id));
        if (pendingIds.length === 0) {
          if (active) setTriage([]);
          return;
        }
        let detailsQuery = db.from('agendamentos')
          .select('id, hora_inicio, status, pacientes(nome, nome_social), medicos(nome)')
          .eq('clinica_id', clinicId)
          .eq('data', today)
          .in('id', pendingIds)
          .limit(100);
        if (doctorId) detailsQuery = detailsQuery.eq('medico_id', doctorId);
        const { data, error: detailsError } = await detailsQuery;
        if (detailsError) throw detailsError;
        const rows = (data ?? []) as TriageRow[];
        if (active) setTriage(rows.map(row => ({
          id: row.id,
          filaId: null,
          queuePosition: null,
          agendamento_id: row.id,
          tipo: null,
          tipoExame: null,
          horario: row.hora_inicio,
          status: row.status,
          prioridade: null,
          paciente: row.pacientes?.nome_social || row.pacientes?.nome || 'Paciente',
          medico: row.medicos?.nome || 'Profissional não informado',
          salaId: null,
        })));
      }
    })().catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [clinicId, canLoadPanel, doctorOnly, panel, refreshKey]);

  async function callPatient(item: WorkItem) {
    if (!supabase || !clinicId || transitionLock.current) return;
    transitionLock.current = true;
    const expectedStatus = item.status === 'chamado' ? 'chamado' : 'aguardando';
    setBusyQueueId(item.id);
    setActionFeedback(null);
    try {
      const { data, error: updateError } = await supabase
        .from('fila_atendimento')
        .update({ status: 'chamado', sala_id: item.salaId })
        .eq('id', item.id)
        .eq('clinica_id', clinicId)
        .eq('status', expectedStatus)
        .select('id');
      if (updateError) throw updateError;
      if (!data?.length) {
        setActionFeedback({ message: 'A fila mudou. Atualize a tela antes de chamar este paciente.', error: true });
        setRefreshKey(value => value + 1);
        return;
      }
      setActionFeedback({ message: expectedStatus === 'chamado' ? 'Paciente chamado novamente.' : 'Paciente chamado.', error: false });
      setRefreshKey(value => value + 1);
    } catch {
      setActionFeedback({ message: 'Não foi possível chamar o paciente. Confira sua permissão e tente atualizar a fila.', error: true });
    } finally {
      transitionLock.current = false;
      setBusyQueueId(null);
    }
  }

  async function startAppointment(item: WorkItem) {
    if (!supabase || !clinicId || !item.filaId || transitionLock.current) return;
    transitionLock.current = true;
    setBusyQueueId(item.id);
    setActionFeedback(null);
    try {
      // Same transactional transition used by the web queue: the server
      // checks clinic, triage, billing and the current appointment state.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error: transitionError } = await db.rpc('iniciar_atendimento_atomico', {
        p_agendamento_id: item.agendamento_id,
        p_fila_id: item.filaId,
      });
      if (transitionError) throw transitionError;
      if (!data) throw new Error('A transição não retornou uma confirmação.');
      setActionFeedback({ message: data.repetido ? 'Este atendimento já estava iniciado.' : 'Atendimento iniciado.', error: false });
      setRefreshKey(value => value + 1);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setActionFeedback({ message: detail.toLowerCase().includes('cobrança')
        ? 'A cobrança do check-in ainda está pendente. Confirme na recepção e atualize a fila.'
        : detail.toLowerCase().includes('triagem')
          ? 'A triagem obrigatória ainda não foi concluída.'
          : 'Não foi possível iniciar. O estado ou a permissão pode ter mudado; atualize a fila.', error: true });
      setRefreshKey(value => value + 1);
    } finally {
      transitionLock.current = false;
      setBusyQueueId(null);
    }
  }

  async function finishAppointment(item: WorkItem, returnDays: number | null) {
    if (!supabase || !clinicId || !item.filaId || transitionLock.current) return;
    transitionLock.current = true;
    setBusyQueueId(item.id);
    setActionFeedback(null);
    try {
      // This RPC is the web's atomic close: it updates the appointment and
      // queue, applies billing rules, and optionally creates a return.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error: transitionError } = await db.rpc('finalizar_atendimento_atomico', {
        p_agendamento_id: item.agendamento_id,
        p_fila_id: item.filaId,
        p_agendar_retorno: returnDays !== null,
        p_dias_retorno: returnDays,
        p_tipo_exame: item.tipoExame,
      });
      if (transitionError) throw transitionError;
      const result = Array.isArray(data) ? data[0] : null;
      if (!result) throw new Error('A finalização não retornou uma confirmação.');
      const suffix = result.repetido ? 'O atendimento já estava finalizado.'
        : result.status_agendamento === 'aguardando_pagamento_adicional' ? 'A fila foi concluída; há pagamento adicional pendente.'
          : result.cobranca_criada ? 'A cobrança foi registrada.' : 'A fila foi concluída.';
      setActionFeedback({ message: returnDays === null ? suffix : `${suffix} Retorno agendado para ${returnDays} dias.` , error: false });
      setFinalizing(null);
      setRefreshKey(value => value + 1);
    } catch {
      setActionFeedback({ message: 'Não foi possível finalizar. O atendimento pode ter mudado; atualize a fila e confira o estado antes de tentar novamente.', error: true });
      setRefreshKey(value => value + 1);
    } finally {
      transitionLock.current = false;
      setBusyQueueId(null);
    }
  }

  const items = panel === 'fila' ? queue : triage;
  const accessAllowed = panel === 'fila' ? canViewQueue : canViewTriage;

  return <MobileScreen>
    <ScreenHeading title="Atendimento" subtitle="Acompanhe a fila e a triagem da clínica." />

    <View accessibilityRole="tablist" style={styles.tabs}>
      <PanelTab label="Fila" icon="people-outline" selected={panel === 'fila'} onPress={() => setPanel('fila')} />
      {canViewTriage ? <PanelTab label="Triagem" icon="heart-outline" selected={panel === 'triagem'} onPress={() => setPanel('triagem')} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Atualizar atendimento" onPress={() => setRefreshKey(value => value + 1)} style={styles.refresh}>
        <Ionicons name="refresh-outline" size={18} color={colors.primary} />
      </Pressable>
    </View>

    {actionFeedback ? <Text accessibilityRole={actionFeedback.error ? 'alert' : 'status'} style={[styles.actionFeedback, actionFeedback.error && styles.actionError]}>{actionFeedback.message}</Text> : null}
    {finalizing ? <View style={styles.finalizePanel}><Text style={styles.finalizeTitle}>Finalizar — {finalizing.paciente}</Text><Text style={styles.finalizeCaption}>Este paciente precisa retornar?</Text><View style={styles.returnOptions}>{[7, 15, 30, 60, 90, 180].map(days => <Pressable key={days} accessibilityRole="button" disabled={busyQueueId !== null} onPress={() => void finishAppointment(finalizing, days)} style={[styles.returnOption, busyQueueId === finalizing.id && styles.callDisabled]}><Text style={styles.returnOptionText}>{days === 180 ? '6 meses' : `${days} dias`}</Text></Pressable>)}</View><View style={styles.finalizeActions}><Pressable accessibilityRole="button" disabled={busyQueueId !== null} onPress={() => setFinalizing(null)} style={styles.cancelFinalization}><Text style={styles.cancelFinalizationText}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" disabled={busyQueueId !== null} onPress={() => void finishAppointment(finalizing, null)} style={[styles.noReturnButton, busyQueueId !== null && styles.callDisabled]}>{busyQueueId === finalizing.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.noReturnText}>Sem retorno</Text>}</Pressable></View></View> : null}
    {profileLoading || loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Carregando {panel === 'fila' ? 'fila' : 'triagem'}…</Text></View> : null}
    {!profileLoading && !accessAllowed ? <State icon="lock-closed-outline" title="Acesso não disponível" message="Este painel não está liberado para o perfil desta conta." /> : null}
    {!profileLoading && accessAllowed && error ? <State icon="alert-circle-outline" title="Não foi possível carregar" message="Confira sua conexão e tente novamente." action={() => setRefreshKey(value => value + 1)} /> : null}
    {!profileLoading && accessAllowed && !loading && !error && items.length === 0 ? <State icon={panel === 'fila' ? 'people-outline' : 'heart-outline'} title={panel === 'fila' ? 'Fila vazia neste momento' : 'Sem triagens pendentes'} message={panel === 'fila' ? 'Os pacientes que entrarem na fila de atendimento aparecerão aqui.' : 'Atendimentos aguardando ou em triagem aparecerão aqui.'} /> : null}
    {!profileLoading && accessAllowed && !error ? items.map((item, index) => <WorkRow key={item.id} item={item} position={index + 1} canCall={panel === 'fila' && ['aguardando', 'chamado'].includes(item.status ?? '')} canStartTriage={panel === 'triagem'} canStart={panel === 'fila' && ['aguardando', 'chamado'].includes(item.status ?? '')} canFinish={panel === 'fila' && item.status === 'em_atendimento'} calling={busyQueueId === item.id} disabled={busyQueueId !== null} onCall={() => void callPatient(item)} onStart={() => void startAppointment(item)} onFinish={() => setFinalizing(item)} onStartTriage={() => router.push({ pathname: '/triage/[appointmentId]', params: { appointmentId: item.agendamento_id } })} />) : null}

    <View style={styles.privacy}><Ionicons name="shield-checkmark-outline" size={15} color={colors.success} /><Text style={styles.privacyText}>Dados limitados ao escopo e às permissões da clínica.</Text></View>
  </MobileScreen>;
}

function PanelTab({ label, icon, selected, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.tab, selected && styles.selectedTab]}><Ionicons name={icon} size={16} color={selected ? '#FFFFFF' : colors.muted} /><Text style={[styles.tabText, selected && styles.selectedTabText]}>{label}</Text></Pressable>;
}

function WorkRow({ item, position, canCall, canStartTriage, canStart, canFinish, calling, disabled, onCall, onStart, onFinish, onStartTriage }: { item: WorkItem; position: number; canCall: boolean; canStartTriage: boolean; canStart: boolean; canFinish: boolean; calling: boolean; disabled: boolean; onCall: () => void; onStart: () => void; onFinish: () => void; onStartTriage: () => void }) {
  const statusLabel = item.status?.replaceAll('_', ' ') || 'Aguardando';
  const priorityLabel = item.prioridade && item.prioridade !== 'normal' ? item.prioridade : null;
  return <View style={styles.row}>
    <View style={[styles.position, position === 1 && styles.firstPosition]}><Text style={[styles.positionText, position === 1 && styles.firstPositionText]}>{position}</Text></View>
    <View style={styles.rowBody}>
      <View style={styles.patientLine}><Text style={styles.patientName}>{item.paciente}</Text>{priorityLabel ? <Text style={styles.priority}>{priorityLabel}</Text> : null}</View>
      <Text style={styles.doctorName}>{item.medico}</Text>
      <View style={styles.meta}><Text style={styles.time}>{timeLabel(item.horario)}</Text><View style={styles.dot} /><Text style={styles.status}>{statusLabel}</Text></View>
      {canCall ? <Pressable accessibilityRole="button" disabled={disabled} onPress={onCall} style={({ pressed }) => [styles.callButton, pressed && styles.callPressed, disabled && styles.callDisabled]}>{calling ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="megaphone-outline" size={15} color={colors.primary} />}<Text style={styles.callText}>{calling ? 'Chamando…' : item.status === 'chamado' ? 'Chamar novamente' : 'Chamar paciente'}</Text></Pressable> : null}
      {canStart ? <Pressable accessibilityRole="button" disabled={disabled} onPress={onStart} style={({ pressed }) => [styles.callButton, pressed && styles.callPressed, disabled && styles.callDisabled]}>{calling ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="play-circle-outline" size={16} color={colors.primary} />}<Text style={styles.callText}>{calling ? 'Iniciando…' : 'Iniciar atendimento'}</Text></Pressable> : null}
      {canFinish ? <Pressable accessibilityRole="button" disabled={disabled} onPress={onFinish} style={({ pressed }) => [styles.callButton, pressed && styles.callPressed, disabled && styles.callDisabled]}><Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} /><Text style={styles.callText}>Finalizar atendimento</Text></Pressable> : null}
      {canStartTriage ? <Pressable accessibilityRole="button" onPress={onStartTriage} style={({ pressed }) => [styles.callButton, pressed && styles.callPressed]}><Ionicons name="heart-outline" size={15} color={colors.primary} /><Text style={styles.callText}>Iniciar triagem</Text></Pressable> : null}
    </View>
  </View>;
}

function State({ icon, title, message, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; message: string; action?: () => void }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name={icon} size={24} color={colors.primary} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{message}</Text>{action ? <Pressable accessibilityRole="button" onPress={action} style={styles.retry}><Text style={styles.retryText}>Tentar novamente</Text></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 4, marginBottom: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: '#EEF0F6' },
  tab: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, paddingHorizontal: 10, borderRadius: 11 },
  selectedTab: { backgroundColor: colors.primary }, tabText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, selectedTabText: { color: '#FFFFFF' },
  refresh: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surface }, actionFeedback: { color: colors.success, fontSize: 11, lineHeight: 16, marginBottom: 9 }, actionError: { color: colors.danger },
  state: { alignItems: 'center', padding: 28, gap: 9 }, stateText: { color: colors.muted, fontSize: 12 },
  row: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  position: { width: 42, height: 46, borderRadius: 14, backgroundColor: '#EFEEF4', alignItems: 'center', justifyContent: 'center' }, positionText: { color: colors.muted, fontSize: 16, fontWeight: '700' }, firstPosition: { backgroundColor: colors.primary }, firstPositionText: { color: '#FFFFFF' },
  rowBody: { flex: 1 }, patientLine: { flexDirection: 'row', alignItems: 'center', gap: 8 }, patientName: { flexShrink: 1, color: colors.ink, fontSize: 13, fontWeight: '700' }, priority: { color: colors.warning, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }, doctorName: { color: colors.muted, fontSize: 11, marginTop: 4 }, meta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 }, time: { color: colors.ink, fontSize: 11, fontWeight: '600' }, dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.muted }, status: { color: colors.muted, fontSize: 10, textTransform: 'capitalize' }, callButton: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, marginTop: 8, borderRadius: 11, backgroundColor: colors.primarySoft }, callPressed: { opacity: 0.72 }, callDisabled: { opacity: 0.5 }, callText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 23, paddingVertical: 42 }, emptyIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, emptyText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 }, retry: { paddingVertical: 10, paddingHorizontal: 14, marginTop: 10, borderRadius: 11, backgroundColor: colors.primarySoft }, retryText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  finalizePanel: { padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.surface }, finalizeTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, finalizeCaption: { color: colors.muted, fontSize: 12, marginTop: 5, marginBottom: 11 }, returnOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, returnOption: { minWidth: 78, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.background }, returnOptionText: { color: colors.primary, fontSize: 11, fontWeight: '700' }, finalizeActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 }, cancelFinalization: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 9 }, cancelFinalizationText: { color: colors.muted, fontSize: 12 }, noReturnButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primary }, noReturnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18 }, privacyText: { color: colors.muted, fontSize: 10 },
});
