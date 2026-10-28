import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, ListRow, Section, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors, radius } from '../../theme/tokens';

type Prediction = { agendamento_id: string; paciente_nome: string; data: string; hora: string | null; medico: string; prob: number; motivos: string[]; recomendacoes: string; updated_at: string | null; telefone: string | null; email: string | null };
type Band = 'alto' | 'medio' | 'baixo';

const PAGE = 500;
// shortcut: caps at 2000 rows on the phone (the web loads up to 20000); a warning shows when reached.
const MAX_ROWS = 2000;
const bandInfo: Record<Band, { label: string; tone: Tone }> = { alto: { label: 'Alto risco', tone: 'danger' }, medio: { label: 'Risco médio', tone: 'warning' }, baixo: { label: 'Baixo risco', tone: 'success' } };
const filters = [{ value: 'todos', label: 'Todos os níveis' }, { value: 'alto', label: 'Alto risco' }, { value: 'medio', label: 'Risco médio' }, { value: 'baixo', label: 'Baixo risco' }];
const bandOf = (p: number): Band => p >= 0.7 ? 'alto' : p >= 0.4 ? 'medio' : 'baixo';
const index = (p: number) => Math.round(Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0)) * 100);
const when = (p: Prediction, short = false) => `${short ? dateLabel(p.data).slice(0, 5) : dateLabel(p.data)}${p.hora ? ` às ${p.hora.slice(0, 5)}` : ''}`;
function whatsapp(p: Prediction) {
  const digits = (p.telefone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const msg = `Olá, ${p.paciente_nome.split(' ')[0]}! Passando para confirmar sua consulta em ${when(p, true)} com ${p.medico}. Podemos contar com você?`;
  return `https://wa.me/${digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`}?text=${encodeURIComponent(msg)}`;
}

export default function NoShowRiskScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [filter, setFilter] = useState('todos');
  const [sending, setSending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    let rows: Record<string, unknown>[] = [];
    while (rows.length < MAX_ROWS) {
      const from = rows.length;
      const to = Math.min(from + PAGE, MAX_ROWS) - 1;
      const page = (must(await client.from('predicoes_no_show')
        .select('agendamento_id,paciente_id,probabilidade_no_show,motivos_risco,recomendacoes,updated_at,agendamentos!inner(data,hora_inicio,status,pacientes(nome,email,telefone),medicos(nome))')
        .eq('clinica_id', clinicId).gte('agendamentos.data', today).in('agendamentos.status', ['agendado', 'confirmado'])
        .order('probabilidade_no_show', { ascending: false }).order('agendamento_id', { ascending: true }).range(from, to)) ?? []) as Record<string, unknown>[];
      rows = rows.concat(page);
      if (page.length < to - from + 1) break;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any): Prediction => ({
      agendamento_id: r.agendamento_id, paciente_nome: r.agendamentos?.pacientes?.nome || 'Paciente', data: r.agendamentos?.data, hora: r.agendamentos?.hora_inicio ?? null,
      medico: r.agendamentos?.medicos?.nome || 'Médico', prob: Number(r.probabilidade_no_show || 0), motivos: r.motivos_risco || [], recomendacoes: r.recomendacoes || 'Lembrete padrão',
      updated_at: r.updated_at ?? null, telefone: r.agendamentos?.pacientes?.telefone ?? null, email: r.agendamentos?.pacientes?.email ?? null,
    })).sort((a, b) => b.prob - a.prob);
  }, [clinicId, today]);

  const all = data ?? [];
  const shown = all.filter(p => filter === 'todos' || bandOf(p.prob) === filter);
  const stamps = all.map(p => p.updated_at ? Date.parse(p.updated_at) : Number.NaN).filter(Number.isFinite);
  const last = stamps.length ? Math.max(...stamps) : null;
  const stale = stamps.some(t => Date.now() - t > 2 * 3600000);
  const top = all[0] ?? null;
  const count = (b: Band) => all.filter(p => bandOf(p.prob) === b).length;

  async function remind(p: Prediction) {
    if (!p.telefone && !p.email) return setFeedback({ message: 'Não há contato cadastrado para este paciente. Atualize o telefone ou e-mail no cadastro antes de enviar o lembrete.', error: true });
    setSending(p.agendamento_id); setFeedback(null);
    try {
      const queued = must(await db.rpc('enfileirar_lembrete_risco', { p_agendamento_id: p.agendamento_id }));
      setFeedback({ message: queued ? 'Lembrete enfileirado' : 'Já existe um lembrete na fila ou enviado nas últimas 20 horas' });
    } catch (err) { setFeedback({ message: `Não foi possível enfileirar o lembrete. ${friendlyError(err, 'Verifique a conexão e tente novamente.')}`, error: true }); } finally { setSending(null); }
  }

  function row(p: Prediction, i: number) {
    const band = bandInfo[bandOf(p.prob)];
    const wa = whatsapp(p);
    const noContact = !p.telefone && !p.email;
    return <View key={p.agendamento_id} style={styles.item}>
      <ListRow title={`${i + 1}. ${p.paciente_nome}`} subtitle={[when(p), p.medico].join(' · ')} tone={band.tone} meta={p.recomendacoes} right={<Badge label={`${index(p.prob)}% · ${band.label}`} tone={band.tone} />} />
      <View accessibilityLabel={`Índice de risco ${index(p.prob)}%`} style={styles.bar}><View style={[styles.barFill, { width: `${index(p.prob)}%`, backgroundColor: band.tone === 'danger' ? colors.danger : band.tone === 'warning' ? colors.warning : colors.success }]} /></View>
      {p.motivos.length ? <Text style={styles.note}>{p.motivos.join(' · ')}</Text> : null}
      <View style={styles.actions}>
        {wa ? <Button variant="ghost" icon="logo-whatsapp" label="WhatsApp" onPress={() => void Linking.openURL(wa)} /> : null}
        {p.telefone ? <Button variant="ghost" icon="call-outline" label="Ligar" onPress={() => void Linking.openURL(`tel:${p.telefone!.replace(/[^0-9+]/g, '')}`)} /> : null}
        {p.email ? <Button variant="ghost" icon="mail-outline" label="E-mail" onPress={() => void Linking.openURL(`mailto:${p.email}`)} /> : null}
        <Button icon="flash-outline" label={noContact ? 'Sem contato' : sending === p.agendamento_id ? 'Enfileirando…' : 'Enviar lembrete'} loading={sending === p.agendamento_id} disabled={sending !== null || noContact} onPress={() => void remind(p)} />
      </View>
    </View>;
  }

  return <ModuleScreen moduleKey="risco-faltas" subtitle={all.length ? `${all.length} consulta(s) a partir de hoje · ${count('alto')} em alto risco${count('medio') ? ` · ${count('medio')} em risco médio` : ''}` : 'Priorize confirmações pelos agendamentos com maior chance de falta'} refreshing={refreshing} onRefresh={refresh}>
    <Text style={styles.note}>Índice heurístico baseado no histórico para ajudar a equipe a priorizar confirmações; não é uma previsão estatística confirmada. Revise cada caso antes de entrar em contato.</Text>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando previsões…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as previsões de faltas" message={`Os indicadores só aparecem depois de confirmar os dados atuais. ${error}`} onAction={reload} /> : <>
      <Text accessibilityRole={stale ? 'alert' : undefined} style={[styles.note, stale && styles.warn]}>{last ? `Último cálculo: ${dateLabel(new Date(last).toISOString()).replace(/,? /, ' às ')}.` : 'Ainda não há previsões calculadas.'}{stale ? ' Algumas previsões têm mais de 2 horas; confira os dados antes de agir.' : ''}</Text>
      {all.length >= MAX_ROWS ? <Feedback error message="A lista atingiu o limite de previsões carregadas no celular. A lista e os indicadores podem estar incompletos." /> : null}
      <View style={styles.stats}>
        <Stat label="Alto risco · confirmar primeiro" value={count('alto')} tone="danger" onPress={() => setFilter(f => f === 'alto' ? 'todos' : 'alto')} />
        <Stat label="Risco médio · vale um lembrete" value={count('medio')} tone="warning" onPress={() => setFilter(f => f === 'medio' ? 'todos' : 'medio')} />
        <Stat label="Baixo risco" value={count('baixo')} tone="success" onPress={() => setFilter(f => f === 'baixo' ? 'todos' : 'baixo')} />
        <Stat label="Índice médio" value={`${all.length ? index(all.reduce((s, p) => s + p.prob, 0) / all.length) : 0}%`} tone="neutral" />
      </View>
      {top ? <Card style={styles.top}><Text style={styles.eyebrow}>Maior risco agora</Text>{row(top, 0)}</Card> : null}
      <Chips options={filters} value={filter} onChange={setFilter} />
      {!shown.length ? <StateView icon="pulse-outline" title={all.length ? 'Nenhum agendamento nesta faixa de risco' : 'Nenhuma previsão disponível para hoje'}
        message={all.length ? 'Há agendamentos em outras faixas. Mostre todos os níveis para voltar à lista completa.' : 'As previsões aparecem para agendamentos futuros confirmados quando há dados calculados. Você pode consultar a agenda enquanto isso.'}
        actionLabel={all.length ? 'Mostrar todos os riscos' : 'Abrir agenda'} onAction={() => all.length ? setFilter('todos') : router.push('/(tabs)/agenda')} /> :
        <Section title={`Agendamentos por risco (${shown.length} de ${all.length})`}>{shown.map(p => row(p, all.indexOf(p)))}</Section>}
      <Card style={styles.how}><Text style={styles.howTitle}>Como funciona o índice?</Text><Text style={styles.note}>Histórico real de faltas e cancelamentos do paciente · Confirmação pendente e antecedência do agendamento · Dia da semana e horário da consulta · Recalculado automaticamente a cada hora</Text></Card>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  note: { color: colors.muted, fontSize: 11, lineHeight: 17, marginVertical: 4 }, warn: { color: colors.warning, fontWeight: '700' }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  item: { marginBottom: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6 }, bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginTop: 6 }, barFill: { height: '100%', borderRadius: radius.pill },
  top: { marginBottom: 12, borderColor: colors.primary }, eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, how: { marginTop: 16, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }, howTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
});
