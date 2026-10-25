import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Button, Card, Chips, Feedback, Field, Section, StateView } from '../../components/ui';
import { friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { WEB_BASE_URL } from '../../navigation/catalog';
import { colors, radius } from '../../theme/tokens';

// "Horários" tab of src/pages/Configuracoes.tsx + src/components/configuracoes/AgendamentoOnlineConfig.tsx.
type Online = { ativo: boolean; mensagem: string; dias_antecedencia: number; medicos: string[] };
type Hours = Record<string, unknown> & { horarioAbertura: string; horarioFechamento: string; horarioAlmocoInicio: string; horarioAlmocoFim: string; duracaoConsulta: number; intervaloConsultas: number; diasFuncionamento: string[]; sabadoAbertura: string; sabadoFechamento: string };
type Doctor = { id: string; nome: string | null; especialidade: string | null; ativo: boolean | null };
const ONLINE_DEFAULT: Online = { ativo: false, mensagem: '', dias_antecedencia: 30, medicos: [] };
const HOURS_DEFAULT = { horarioAbertura: '08:00', horarioFechamento: '18:00', horarioAlmocoInicio: '12:00', horarioAlmocoFim: '13:00', duracaoConsulta: 30, intervaloConsultas: 5, diasFuncionamento: ['seg', 'ter', 'qua', 'qui', 'sex'], sabadoAbertura: '08:00', sabadoFechamento: '12:00' };
const days = [['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb'], ['dom', 'Dom']] as const;
const durations = [10, 15, 20, 25, 30, 40, 45, 50, 60].map(m => ({ value: String(m), label: `${m} min` }));
const gaps = [0, 5, 10, 15, 20, 30].map(m => ({ value: String(m), label: m === 0 ? 'Sem intervalo' : `${m} min` }));

/** Copy of validarHorarioClinica in src/pages/Configuracoes.tsx. */
function validateHours(c: Hours): string | null {
  const min = (v: string) => { const m = /^(\d{2}):(\d{2})$/.exec(v || ''); return !m || Number(m[1]) > 23 || Number(m[2]) > 59 ? null : Number(m[1]) * 60 + Number(m[2]); };
  const open = min(c.horarioAbertura), close = min(c.horarioFechamento);
  if (open === null || close === null || open >= close) return 'O fechamento principal deve ocorrer depois da abertura, com horários válidos.';
  const ls = c.horarioAlmocoInicio ? min(c.horarioAlmocoInicio) : null, le = c.horarioAlmocoFim ? min(c.horarioAlmocoFim) : null;
  if (Boolean(c.horarioAlmocoInicio) !== Boolean(c.horarioAlmocoFim)) return 'Preencha os dois horários do intervalo ou deixe ambos vazios.';
  if (c.horarioAlmocoInicio && (ls === null || le === null)) return 'Informe horários válidos para o intervalo.';
  if (ls !== null && le !== null && (ls >= le || ls < open || le > close)) return 'O intervalo deve estar dentro do horário de funcionamento e terminar depois do início.';
  if (c.diasFuncionamento.includes('sab')) {
    const so = min(c.sabadoAbertura), sc = min(c.sabadoFechamento);
    if (so === null || sc === null || so >= sc) return 'O fechamento de sábado deve ocorrer depois da abertura, com horários válidos.';
  }
  return null;
}

export default function HoursScreen() {
  const { session, profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [online, setOnline] = useState<Online | null>(null);
  const [daysAhead, setDaysAhead] = useState('30');
  const [hours, setHours] = useState<Hours | null>(null);
  const [busy, setBusy] = useState<'online' | 'hours' | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean; reauth?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [configs, clinic, doctors] = await Promise.all([
      client.from('configuracoes_clinica').select('chave, valor, updated_at').eq('clinica_id', clinicId).in('chave', ['agendamento_online', 'config_clinica']).order('updated_at', { ascending: false }),
      client.from('clinicas').select('nome, cnpj').eq('id', clinicId).maybeSingle(),
      client.from('medicos').select('id, nome, especialidade, ativo').eq('clinica_id', clinicId).order('nome'),
    ]);
    const rows = (must(configs) ?? []) as { chave: string; valor: Record<string, unknown> | null; updated_at: string | null }[];
    const first = (key: string) => rows.find(r => r.chave === key);
    const base = must<{ nome: string | null; cnpj: string | null } | null>(clinic);
    const cc = (first('config_clinica')?.valor ?? {}) as Record<string, unknown>;
    return {
      online: { ...ONLINE_DEFAULT, ...(first('agendamento_online')?.valor ?? {}) } as Online, onlineVersion: first('agendamento_online')?.updated_at ?? null,
      // Same merge as the web so saving keeps every other config_clinica field.
      hours: { ...HOURS_DEFAULT, ...cc, nomeClinica: cc.nomeClinica || base?.nome || '', cnpj: cc.cnpj || base?.cnpj || '' } as Hours, hoursVersion: first('config_clinica')?.updated_at ?? null,
      doctors: (must(doctors) ?? []) as Doctor[],
    };
  }, [clinicId]);

  useEffect(() => { if (data) { setOnline(data.online); setDaysAhead(String(data.online.dias_antecedencia)); setHours(data.hours); } }, [data]);

  async function saveOnline() {
    if (!online || !data || !clinicId || !session) return;
    const value = { ...online, dias_antecedencia: Math.min(180, Math.max(1, Number(daysAhead) || 1)) };
    setBusy('online');
    setFeedback(null);
    const now = new Date().toISOString();
    try {
      // Same as salvarConfigClinica with expectedUpdatedAt: conditional update, or insert when no row exists.
      if (data.onlineVersion) {
        const rows = must(await db.from('configuracoes_clinica').update({ valor: value, updated_at: now }).eq('clinica_id', clinicId).eq('chave', 'agendamento_online').eq('updated_at', data.onlineVersion).select('id')) ?? [];
        if (!rows.length) throw new Error('Outra pessoa atualizou esta configuração. Atualize os dados antes de salvar novamente.');
      } else {
        const { error: insertError } = await db.from('configuracoes_clinica').insert({ clinica_id: clinicId, user_id: session.user.id, chave: 'agendamento_online', valor: value, updated_at: now });
        if (insertError) throw new Error(insertError.code === '23505' ? 'Outra pessoa criou esta configuração. Atualize os dados antes de salvar novamente.' : insertError.message);
      }
      setFeedback({ message: value.ativo ? 'Agendamento online ativado.' : 'Configuração salva.' });
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível salvar.'), error: true }); } finally { setBusy(null); }
  }

  async function saveHours() {
    if (!hours || !data) return;
    const invalid = validateHours(hours);
    if (invalid) return setFeedback({ message: `Revise os horários: ${invalid}`, error: true });
    setBusy('hours');
    setFeedback(null);
    try {
      const { data: version, error: rpcError } = await db.rpc('salvar_configuracao_clinica_segura', { p_chave: 'config_clinica', p_valor: hours, p_versao_esperada: data.hoursVersion });
      if (rpcError) {
        if (rpcError.hint === 'reautenticacao_necessaria') return setFeedback({ message: 'Por segurança, confirme sua identidade na versão web para salvar esta alteração.', error: true, reauth: true });
        throw new Error(rpcError.message);
      }
      if (typeof version !== 'string') throw new Error('A configuração foi salva, mas a versão não foi confirmada. Atualize os dados antes de salvar novamente.');
      setFeedback({ message: 'Horários salvos na nuvem!' });
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao salvar. Atualize os dados e tente novamente.'), error: true }); } finally { setBusy(null); }
  }

  const link = clinicId ? `${WEB_BASE_URL}/agendar/${clinicId}` : '';
  const toggleDoctor = (id: string) => online && setOnline({ ...online, medicos: online.medicos.includes(id) ? online.medicos.filter(m => m !== id) : [...online.medicos, id] });
  const time = (key: keyof Hours, label: string) => hours ? <View style={styles.half}><Field label={label} value={String(hours[key] ?? '')} onChangeText={v => setHours({ ...hours, [key]: v })} placeholder="HH:MM" keyboardType="numbers-and-punctuation" maxLength={5} /></View> : null;
  const listed = (data?.doctors ?? []).filter(d => d.ativo || online?.medicos.includes(d.id));
  const missing = (online?.medicos ?? []).filter(id => !(data?.doctors ?? []).some(d => d.id === id && d.ativo));

  return <ModuleScreen moduleKey="horarios" subtitle="Horário da clínica e link de agendamento online." refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {feedback?.reauth ? <OpenOnWeb path="/configuracoes?tab=horarios" /> : null}
    {loading ? <StateView loading title="Carregando as configurações…" /> : error || !online || !hours ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os horários" message={error ?? 'Recarregue os dados antes de fazer qualquer alteração.'} onAction={reload} /> : <>
      <Section title="Agendamento online"><Card>
        <Text style={styles.help}>Um link para o paciente marcar consulta sozinho. Os pedidos entram na agenda como "agendado" para a recepção confirmar.</Text>
        <View style={styles.switchRow}><View style={styles.fill}><Text style={styles.label}>Receber agendamentos pelo link</Text><Text style={styles.help}>Desligado, o link mostra que a clínica não está recebendo agendamentos online.</Text></View>
          <Switch value={online.ativo} onValueChange={ativo => setOnline({ ...online, ativo })} accessibilityLabel="Ativar agendamento online" trackColor={{ true: colors.primary, false: colors.border }} /></View>
        <Pressable accessibilityRole="link" accessibilityLabel="Abrir link da clínica" onPress={() => void Linking.openURL(link)} style={styles.link}><Text style={styles.label}>Link da clínica</Text><Text selectable style={styles.linkText}>{link}</Text></Pressable>
        <Field label="Agendar com até quantos dias de antecedência" value={daysAhead} onChangeText={setDaysAhead} keyboardType="number-pad" maxLength={3} hint="Entre 1 e 180 dias." />
        <Field label="Mensagem no topo da página (opcional)" value={online.mensagem} onChangeText={mensagem => setOnline({ ...online, mensagem })} maxLength={300} multiline placeholder="Ex.: Atendemos convênios Unimed e particular. Chegue 15 minutos antes." />
        <Text style={styles.label}>Profissionais no link</Text>
        <Text style={styles.help}>Nenhum marcado = todos os médicos ativos com disponibilidade cadastrada.</Text>
        {missing.length ? <Text style={styles.warn}>Há profissional(is) selecionado(s) que estão inativo(s) ou sem cadastro. Eles não aparecem no link público.</Text> : null}
        <View style={styles.chips}>{listed.map(d => { const on = online.medicos.includes(d.id); return <Pressable key={d.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggleDoctor(d.id)} style={[styles.chip, on && styles.chipOn]}><Text style={[styles.chipText, on && styles.chipTextOn]}>{d.nome ?? 'Profissional'}{d.especialidade ? ` · ${d.especialidade}` : ''}{!d.ativo ? ' (inativo)' : ''}</Text></Pressable>; })}
          {missing.filter(id => !listed.some(d => d.id === id)).map(id => <Pressable key={id} accessibilityRole="checkbox" accessibilityState={{ checked: true }} onPress={() => toggleDoctor(id)} style={[styles.chip, styles.chipOn]}><Text style={styles.chipTextOn}>Profissional sem cadastro ({id.slice(0, 8)})</Text></Pressable>)}</View>
        <Button label="Salvar" icon="checkmark" loading={busy === 'online'} disabled={busy !== null} onPress={() => void saveOnline()} />
      </Card></Section>
      <Section title="Horários de funcionamento"><Card>
        <Text style={styles.help}>Horário geral da clínica, exibido no link público. Os horários disponíveis para marcar dependem da agenda de cada profissional.</Text>
        <View style={styles.row}>{time('horarioAbertura', 'Abertura')}{time('horarioFechamento', 'Fechamento')}</View>
        <View style={styles.row}>{time('horarioAlmocoInicio', 'Início Almoço')}{time('horarioAlmocoFim', 'Fim Almoço')}</View>
        <Chips label="Duração Padrão" options={durations} value={String(hours.duracaoConsulta)} onChange={v => setHours({ ...hours, duracaoConsulta: Number(v) })} />
        <Chips label="Intervalo entre Consultas" options={gaps} value={String(hours.intervaloConsultas)} onChange={v => setHours({ ...hours, intervaloConsultas: Number(v) })} />
        <Text style={styles.label}>Dias de Funcionamento</Text>
        <View style={styles.chips}>{days.map(([value, label]) => { const on = hours.diasFuncionamento.includes(value); return <Pressable key={value} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={() => setHours({ ...hours, diasFuncionamento: on ? hours.diasFuncionamento.filter(d => d !== value) : [...hours.diasFuncionamento, value] })} style={[styles.chip, on && styles.chipOn]}><Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text></Pressable>; })}</View>
        {hours.diasFuncionamento.includes('sab') ? <><Text style={styles.label}>Horário de Sábado</Text><View style={styles.row}>{time('sabadoAbertura', 'Abertura')}{time('sabadoFechamento', 'Fechamento')}</View></> : null}
        <Button label={busy === 'hours' ? 'Salvando…' : 'Salvar na nuvem'} icon="cloud-upload-outline" loading={busy === 'hours'} disabled={busy !== null} onPress={() => void saveHours()} />
      </Card></Section>
    </>}
    <Text style={styles.note}>A disponibilidade de cada profissional e o histórico de versões ficam na versão web.</Text>
    <OpenOnWeb path="/configuracoes?tab=horarios" />
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  help: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 10 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 6 }, warn: { color: colors.warning, fontSize: 11, lineHeight: 16, marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }, fill: { flex: 1 }, link: { minHeight: 44, marginBottom: 14 }, linkText: { color: colors.primary, fontSize: 12 },
  row: { flexDirection: 'row', gap: 10 }, half: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, chip: { minHeight: 44, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' }, chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, chipText: { color: colors.ink, fontSize: 12, fontWeight: '600' }, chipTextOn: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginVertical: 14 },
});
