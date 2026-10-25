import { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { WEB_BASE_URL } from '../../navigation/catalog';
import { colors } from '../../theme/tokens';

type Status = 'aceito' | 'expirado' | 'pendente';
type Invite = { id: string; source: 'convites_funcionario' | 'employee_invitations'; email: string; nome: string | null; roles: string[]; token: string; created_at: string; expires_at: string; accepted_at: string | null; status: Status };
type Row = { id: string; email: string; nome?: string | null; roles: string[] | null; token: string; created_at: string; expires_at: string; accepted_at: string | null; funcionario_id?: string | null };
type Resource = { chave: string; usado: number | string; limite: number | string | null };

const LIMIT = 500;
const roles = [{ value: 'admin', label: 'Administrador' }, { value: 'medico', label: 'Médico' }, { value: 'recepcao', label: 'Recepção' }, { value: 'enfermagem', label: 'Enfermagem' }, { value: 'financeiro', label: 'Financeiro' }];
const roleLabel = Object.fromEntries(roles.map(r => [r.value, r.label])) as Record<string, string>;
const statusInfo: Record<Status, { label: string; tone: Tone }> = { pendente: { label: 'Pendente', tone: 'warning' }, aceito: { label: 'Aceito', tone: 'success' }, expirado: { label: 'Expirado', tone: 'danger' } };
const statusOf = (r: Row): Status => r.accepted_at ? 'aceito' : new Date(r.expires_at) < new Date() ? 'expirado' : 'pendente';
const emptyForm = { nome: '', email: '', roles: [] as string[] };

export default function InvitesScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [filter, setFilter] = useState<Status | 'todos'>('todos');
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [cf, ei, uso] = await Promise.all([
      client.from('convites_funcionario').select('id, email, nome, roles, token, created_at, expires_at, accepted_at').eq('clinica_id', clinicId).order('created_at', { ascending: false }).order('id').limit(LIMIT),
      client.from('employee_invitations').select('id, email, roles, token, created_at, expires_at, accepted_at, funcionario_id').eq('clinica_id', clinicId).order('created_at', { ascending: false }).order('id').limit(LIMIT),
      client.rpc('uso_plano_clinica'),
    ]);
    const legacy = (must(ei) ?? []) as Row[];
    const funcIds = [...new Set(legacy.map(r => r.funcionario_id).filter(Boolean))];
    const names = new Map<string, string>(funcIds.length ? (must(await client.from('funcionarios').select('id, nome').eq('clinica_id', clinicId).in('id', funcIds)) ?? []).map((f: { id: string; nome: string }) => [f.id, f.nome]) : []);
    const map = (source: Invite['source']) => (r: Row): Invite => ({ id: r.id, source, email: r.email, nome: r.nome ?? (r.funcionario_id ? names.get(r.funcionario_id) ?? null : null), roles: r.roles ?? [], token: r.token, created_at: r.created_at, expires_at: r.expires_at, accepted_at: r.accepted_at, status: statusOf(r) });
    const invites = [...((must(cf) ?? []) as Row[]).map(map('convites_funcionario')), ...legacy.map(map('employee_invitations'))].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    // Plan usage is advisory here; invite-employee enforces the same limits on the server.
    const recursos = uso.error ? null : ((uso.data?.recursos ?? []) as Resource[]);
    const vaga = (k: string) => { const r = recursos?.find(x => x.chave === k); return !!r && r.limite != null && Number(r.limite) - Number(r.usado ?? 0) > 0; };
    return { invites, truncated: legacy.length >= LIMIT || (must(cf) ?? []).length >= LIMIT, plan: recursos ? { nome: (uso.data?.plano_nome ?? null) as string | null, recursos, canFunc: vaga('funcionarios'), canMedico: vaga('funcionarios') && vaga('medicos') } : null };
  }, [clinicId]);

  const invites = data?.invites ?? [];
  const visible = filter === 'todos' ? invites : invites.filter(i => i.status === filter);
  const count = (s: Status) => invites.filter(i => i.status === s).length;
  const semPapel = invites.filter(i => i.status !== 'aceito' && !i.roles.length);
  const plan = data?.plan;
  const willExceed = !!form && !!plan && (!plan.canFunc || (form.roles.includes('medico') && !plan.canMedico));

  async function sendInvite(body: { email: string; nome: string; roles: string[] }, id: string) {
    setBusy(id);
    setFeedback(null);
    try {
      const { data: res, error: fnError } = await db.functions.invoke('invite-employee', { body });
      if (fnError) throw fnError;
      if (res && res.success === false) throw new Error(res.error);
      setFeedback({ message: res?.emailStatus === 'sent' ? 'Convite enviado por e-mail.' : 'Convite criado, mas o e-mail não foi enviado. Use "Compartilhar link" na lista para enviar o link.' });
      return true;
    } catch (err) { setFeedback({ message: `Não foi possível enviar o convite: ${friendlyError(err)}`, error: true }); return false; } finally { setBusy(null); reload(); }
  }

  async function create() {
    if (!form) return;
    if (!form.nome.trim()) return setFeedback({ message: 'Informe o nome do funcionário.', error: true });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setFeedback({ message: 'E-mail inválido. Confira se não faltou o @ ou o ponto no domínio.', error: true });
    if (!form.roles.length) return setFeedback({ message: 'Escolha a função deste funcionário. Sem função, ele entra no sistema e não vê nenhuma tela.', error: true });
    if (willExceed) return setFeedback({ message: 'Limite de funcionários do plano atingido. Remova um funcionário inativo ou mude de plano para convidar mais.', error: true });
    if (await sendInvite({ email: form.email.trim(), nome: form.nome.trim(), roles: form.roles }, 'new')) setForm(null);
  }

  function resend(inv: Invite) {
    if (!inv.roles.length) return setFeedback({ message: 'Este convite não tem função definida. Defina a função do funcionário na aba Funcionários e convide de novo.', error: true });
    void sendInvite({ email: inv.email, nome: inv.nome || inv.email, roles: inv.roles }, inv.id);
  }

  function cancel(inv: Invite) {
    Alert.alert('Cancelar este convite?', `O link enviado para ${inv.email} deixa de funcionar imediatamente. Se a pessoa ainda precisar de acesso, será necessário convidá-la de novo.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Cancelar convite', style: 'destructive', onPress: () => void (async () => {
        setBusy(inv.id);
        setFeedback(null);
        try {
          // Same as the web: legacy employee_invitations has no DELETE policy, so expire it instead.
          const base = inv.source === 'employee_invitations'
            ? db.from('employee_invitations').update({ status: 'expired', expires_at: new Date().toISOString() })
            : db.from('convites_funcionario').delete();
          const row = must(await base.eq('id', inv.id).eq('clinica_id', clinicId).select('id').maybeSingle());
          if (!row) throw new Error('Convite não encontrado ou sem permissão para cancelar.');
          setFeedback({ message: 'Convite cancelado. O link deixou de funcionar.' });
        } catch (err) { setFeedback({ message: `Não foi possível cancelar o convite: ${friendlyError(err)}`, error: true }); } finally { setBusy(null); reload(); }
      })() },
    ]);
  }

  const subtitle = invites.length ? `${invites.length} convite(s) · ${count('pendente')} pendente(s) · ${count('aceito')} aceito(s)` : 'Acompanhe o acesso da equipe e mantenha os convites sob controle.';

  return <ModuleScreen moduleKey="convites" subtitle={subtitle} refreshing={refreshing} onRefresh={refresh}
    action={form ? null : <Button label="Novo" icon="add" onPress={() => { setForm(emptyForm); setFeedback(null); }} />}>
    {form ? <Card style={styles.form}>
      <Text style={styles.title}>Convidar funcionário</Text>
      <Text style={styles.note}>Envia um e-mail com link de cadastro. O funcionário define sua própria senha.</Text>
      {plan ? <Text style={styles.note}>Plano {plan.nome ?? 'não definido'} · {plan.recursos.filter(r => r.chave === 'funcionarios' || r.chave === 'medicos').map(r => `${Number(r.usado ?? 0)}/${r.limite ?? '—'} ${r.chave === 'medicos' ? 'médicos' : 'funcionários'}`).join(' · ')}</Text> : null}
      <Field label="Nome" value={form.nome} onChangeText={nome => setForm({ ...form, nome })} />
      <Field label="E-mail" value={form.email} onChangeText={email => setForm({ ...form, email })} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Text style={styles.label}>Papéis</Text>
      <View style={styles.roles}>{roles.map(r => {
        const on = form.roles.includes(r.value);
        return <Button key={r.value} variant={on ? 'primary' : 'secondary'} icon={on ? 'checkbox' : 'square-outline'} label={r.label} onPress={() => setForm({ ...form, roles: on ? form.roles.filter(x => x !== r.value) : [...form.roles, r.value] })} />;
      })}</View>
      {willExceed ? <Feedback error message="Limite do plano atingido. Faça upgrade para adicionar mais membros." /> : null}
      {feedback?.error ? <Feedback message={feedback.message} error /> : null}
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => { setForm(null); setFeedback(null); }} /><Button label="Enviar convite" icon="mail-outline" loading={busy === 'new'} disabled={willExceed} onPress={() => void create()} /></View>
    </Card> : null}
    {feedback && !form ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando convites…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os convites" message={`${error} Nenhum convite foi alterado.`} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Pendentes" value={count('pendente')} tone="warning" onPress={() => setFilter(filter === 'pendente' ? 'todos' : 'pendente')} />
        <Stat label="Aceitos" value={count('aceito')} tone="success" onPress={() => setFilter(filter === 'aceito' ? 'todos' : 'aceito')} />
        <Stat label="Expirados" value={count('expirado')} tone="danger" onPress={() => setFilter(filter === 'expirado' ? 'todos' : 'expirado')} />
        <Stat label="Total" value={invites.length} onPress={() => setFilter('todos')} />
      </View>
      {semPapel.length ? <Feedback error message={`${semPapel.length === 1 ? '1 convite não vai dar acesso a nada' : `${semPapel.length} convites não vão dar acesso a nada`}: ${semPapel.map(i => i.email).join(', ')}. Cancele, defina a função do funcionário na aba Funcionários e convide de novo.`} /> : null}
      {data?.truncated ? <Feedback error message={`A lista atingiu o limite de ${LIMIT} convites por origem. Convites mais antigos podem não aparecer.`} /> : null}
      <Chips options={[{ value: 'todos', label: 'Todos' }, { value: 'pendente', label: 'Pendentes' }, { value: 'aceito', label: 'Aceitos' }, { value: 'expirado', label: 'Expirados' }]} value={filter} onChange={setFilter} />
      {!invites.length ? <StateView icon="mail-outline" title="Nenhum convite enviado" message="Toque em Novo para convidar alguém da equipe." />
        : !visible.length ? <StateView icon="mail-outline" title={`Nenhum convite ${filter === 'pendente' ? 'pendente' : filter === 'aceito' ? 'aceito' : 'expirado'}.`} />
        : <Section title={`${visible.length} de ${invites.length}`}>{visible.map(inv => <View key={`${inv.source}-${inv.id}`}>
          <ListRow icon="mail-outline" title={inv.nome || inv.email} subtitle={inv.nome ? inv.email : null}
            meta={[inv.roles.length ? inv.roles.map(r => roleLabel[r] ?? r).join(', ') : 'Sem função', `Enviado ${dateLabel(inv.created_at)}`, inv.status === 'aceito' ? null : `Expira ${dateLabel(inv.expires_at)}`].filter(Boolean).join(' · ')}
            right={<Badge label={statusInfo[inv.status].label} tone={statusInfo[inv.status].tone} />} />
          {inv.status !== 'aceito' ? <View style={styles.actions}>
            {inv.status === 'pendente' ? <Button variant="ghost" icon="share-outline" label="Compartilhar link" onPress={() => void Share.share({ message: `${WEB_BASE_URL}/aceitar-convite?token=${encodeURIComponent(inv.token)}` })} /> : null}
            <Button variant="secondary" icon="refresh" label="Reenviar" loading={busy === inv.id} disabled={!!busy} onPress={() => resend(inv)} />
            <Button variant="danger" icon="ban-outline" label="Cancelar" disabled={!!busy} onPress={() => cancel(inv)} />
          </View> : null}
        </View>)}</Section>}
    </>}
    <Text style={styles.foot}>O link vale 7 dias. O acesso é liberado conforme a função definida; convite sem função não dá acesso a nada.</Text>
  </ModuleScreen>;
}

const styles = StyleSheet.create({ form: { marginBottom: 6 }, title: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 4 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 6 }, roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingVertical: 10 }, foot: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 } });
