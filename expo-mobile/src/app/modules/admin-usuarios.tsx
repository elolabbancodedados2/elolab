import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, Section, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Role = 'admin' | 'medico' | 'recepcao' | 'enfermagem' | 'financeiro';
type User = { id: string; nome: string; email: string; telefone: string | null; ultimo_acesso: string | null; roles: Role[] };
type Filter = 'todos' | 'online' | 'bloqueados' | 'admins' | 'nunca';

const roleLabels: Record<Role, string> = { admin: 'Administrador', medico: 'Médico', recepcao: 'Recepção', enfermagem: 'Enfermagem', financeiro: 'Financeiro' };
const roleTone: Record<Role, Tone> = { admin: 'danger', medico: 'primary', recepcao: 'success', enfermagem: 'info', financeiro: 'warning' };
const filterLabels: Record<Filter, string> = { todos: 'Contas', online: 'Ativas agora', bloqueados: 'Bloqueadas', admins: 'Administradores', nunca: 'Nunca acessaram' };
const online = (v: string | null) => { if (!v) return false; const m = (Date.now() - new Date(v).getTime()) / 60000; return m >= 0 && m < 15; };

/** Same as the web chamarAdminContas: surface the message the Edge Function wrote, and treat 200 + { error } as failure. */
async function adminContas(acao: 'bloquear' | 'desbloquear', alvo_id: string) {
  const { data, error } = await db.functions.invoke('admin-contas', { body: { acao, alvo_id } });
  if (error) {
    let message = error.message;
    try { const body = await error.context?.json?.(); if (body?.error) message = body.error; } catch { /* no JSON body */ }
    throw new Error(message);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) throw new Error(String(data.error));
}

export default function AdminUsersScreen() {
  const { session } = useAuth();
  const me = session?.user.id;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [form, setForm] = useState<{ user: User; nome: string; telefone: string; roles: Role[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    // shortcut: one PostgREST block (1000 rows) per table, the web pages up to 20000; paginate if the platform outgrows it.
    const [profiles, roles, status] = await Promise.all([
      client.from('profiles').select('id,nome,email,telefone,ultimo_acesso').order('nome', { ascending: true }).order('id', { ascending: true }).range(0, 999),
      client.from('user_roles').select('id,user_id,role').order('id', { ascending: true }).range(0, 999),
      client.rpc('admin_situacao_contas'),
    ]);
    const byUser = new Map<string, Role[]>();
    for (const r of (must<{ user_id: string; role: Role }[]>(roles) ?? [])) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]);
    const blocked = new Set((must<{ user_id: string; bloqueado: boolean }[]>(status) ?? []).filter(s => s.bloqueado).map(s => s.user_id));
    return { users: (must<Omit<User, 'roles'>[]>(profiles) ?? []).map(p => ({ ...p, roles: byUser.get(p.id) ?? [] })), blocked };
  }, []);

  const users = data?.users ?? [];
  const blocked = data?.blocked ?? new Set<string>();
  const tests: Record<Filter, (u: User) => boolean> = { todos: () => true, online: u => online(u.ultimo_acesso), bloqueados: u => blocked.has(u.id), admins: u => u.roles.includes('admin'), nunca: u => !u.ultimo_acesso };
  const n = (f: Filter) => users.filter(tests[f]).length;
  const q = search.trim().toLocaleLowerCase('pt-BR');
  const phone = q.replace(/\D/g, '');
  const list = users.filter(tests[filter]).filter(u => !q || u.nome?.toLocaleLowerCase('pt-BR').includes(q) || u.email?.toLocaleLowerCase('pt-BR').includes(q) || (phone.length > 0 && (u.telefone?.replace(/\D/g, '').includes(phone) ?? false)) || u.roles.some(r => roleLabels[r].toLocaleLowerCase('pt-BR').includes(q)));

  function toggleAccess(u: User) {
    if (u.id === me) return setFeedback({ message: 'Você não pode desativar seu próprio usuário.', error: true });
    const isBlocked = blocked.has(u.id);
    Alert.alert(isBlocked ? 'Liberar acesso' : 'Confirmar bloqueio de acesso', isBlocked ? `Liberar o login de "${u.nome}"?` : `Tem certeza que deseja bloquear o acesso de "${u.nome}"? As sessões serão encerradas e o login ficará impedido até você liberar novamente.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: isBlocked ? 'Liberar acesso' : 'Bloquear acesso', style: isBlocked ? 'default' : 'destructive', onPress: () => void (async () => {
        setBusy(u.id); setFeedback(null);
        try { await adminContas(isBlocked ? 'desbloquear' : 'bloquear', u.id); setFeedback({ message: isBlocked ? 'Acesso liberado.' : 'Acesso bloqueado e sessões encerradas.' }); reload(); }
        catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao alterar acesso.'), error: true }); } finally { setBusy(null); }
      })() },
    ]);
  }

  async function save() {
    if (!form || !form.nome.trim() || !form.roles.length) return setFeedback({ message: 'Preencha todos os campos obrigatórios.', error: true });
    setBusy('save'); setFeedback(null);
    try {
      must(await db.rpc('platform_update_clinic_user', { p_user_id: form.user.id, p_nome: form.nome.trim(), p_telefone: form.telefone || null, p_roles: form.roles }));
      setForm(null); setFeedback({ message: 'Usuário atualizado com sucesso.' }); reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao salvar usuário.'), error: true }); } finally { setBusy(null); }
  }

  return <ModuleScreen moduleKey="admin-usuarios" subtitle={data ? `${users.length} conta(s) · ${n('online')} ativa(s) recentemente · ${n('bloqueados')} bloqueada(s)` : 'Localize usuários e ajude clientes com acesso ao EloLab.'} refreshing={refreshing} onRefresh={refresh}>
    {form ? <Card style={styles.gap}>
      <Text style={styles.title}>Editar usuário · {form.user.email}</Text>
      <Field label="Nome completo *" value={form.nome} onChangeText={nome => setForm({ ...form, nome })} />
      <Field label="Telefone" value={form.telefone} onChangeText={telefone => setForm({ ...form, telefone })} placeholder="(00) 00000-0000" keyboardType="phone-pad" />
      <Text style={styles.label}>Funções do usuário</Text>
      <Text style={styles.muted}>Selecione todas as áreas de trabalho necessárias. É preciso manter pelo menos uma função.</Text>
      <View style={styles.row}>{(Object.keys(roleLabels) as Role[]).map(r => { const on = form.roles.includes(r); return <Pressable key={r} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setForm({ ...form, roles: on ? form.roles.filter(x => x !== r) : [...form.roles, r] })} style={[styles.check, on && styles.checkOn]}><Text style={[styles.checkText, on && styles.checkTextOn]}>{on ? '✓ ' : ''}{roleLabels[r]}</Text></Pressable>; })}</View>
      {!form.roles.length ? <Text accessibilityRole="alert" style={styles.err}>Selecione ao menos uma função.</Text> : null}
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={busy === 'save'} onPress={() => setForm(null)} /><Button label="Salvar" loading={busy === 'save'} disabled={!form.roles.length || !form.nome.trim()} onPress={() => void save()} /></View>
    </Card> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando usuários…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : <>
      <View style={styles.grid}>{(Object.keys(filterLabels) as Filter[]).map(f => <Stat key={f} label={filterLabels[f]} value={n(f)} tone={f === 'bloqueados' ? 'danger' : f === 'online' ? 'success' : f === 'nunca' ? 'warning' : 'primary'} onPress={() => setFilter(filter === f ? 'todos' : f)} />)}</View>
      <Section title="Lista de usuários" action={<Text style={styles.muted}>{list.length} de {users.length}</Text>}>
        <Field label="Buscar usuários" value={search} onChangeText={setSearch} placeholder="Buscar nome, e-mail, telefone ou função" autoCapitalize="none" />
        <Chips options={(Object.keys(filterLabels) as Filter[]).map(value => ({ value, label: value === 'todos' ? 'Todos' : filterLabels[value] }))} value={filter} onChange={setFilter} />
        {!list.length ? <StateView icon="people-outline" title={q || filter !== 'todos' ? 'Nenhum usuário corresponde à busca.' : 'Nenhum usuário encontrado'} message={q || filter !== 'todos' ? 'Ajuste a busca ou o indicador selecionado.' : 'As contas criadas pelas clínicas aparecerão aqui.'} /> : list.map(u => {
          const isBlocked = blocked.has(u.id); const self = u.id === me;
          return <Card key={u.id} style={[styles.item, isBlocked && styles.dim]}>
            <View style={styles.row}><Text style={[styles.title, styles.fill]}>{u.nome}</Text>{self ? <Badge label="Você" tone="info" /> : null}{isBlocked ? <Badge label="Bloqueado" tone="danger" /> : null}</View>
            <Text style={styles.muted}>{u.email}{u.telefone ? ` · ${u.telefone}` : ''}</Text>
            <View style={styles.row}>{u.roles.length ? u.roles.map(r => <Badge key={r} label={roleLabels[r]} tone={roleTone[r]} />) : <Text style={styles.muted}>Sem função</Text>}</View>
            <Text style={[styles.muted, online(u.ultimo_acesso) && styles.on]}>{!u.ultimo_acesso ? 'Nunca acessou' : online(u.ultimo_acesso) ? 'Ativo recentemente' : `Último acesso: ${dateLabel(u.ultimo_acesso)}`}</Text>
            {self ? null : <View style={styles.row}>
              <Button variant="secondary" icon="create-outline" label="Editar" disabled={busy !== null} onPress={() => { setForm({ user: u, nome: u.nome, telefone: u.telefone || '', roles: u.roles.length ? u.roles : ['recepcao'] }); setFeedback(null); }} />
              <Button variant={isBlocked ? 'secondary' : 'danger'} icon={isBlocked ? 'person-add-outline' : 'ban-outline'} label={isBlocked ? 'Liberar acesso' : 'Bloquear acesso'} loading={busy === u.id} disabled={busy !== null} onPress={() => toggleAccess(u)} />
            </View>}
          </Card>;
        })}
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }, fill: { flex: 1 }, gap: { gap: 8, marginBottom: 6 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  item: { marginBottom: 10, gap: 6, padding: 12 }, dim: { opacity: 0.6 }, on: { color: colors.success, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 13, fontWeight: '700' }, label: { color: colors.ink, fontSize: 12, fontWeight: '700' }, muted: { color: colors.muted, fontSize: 11, lineHeight: 16 }, err: { color: colors.danger, fontSize: 11 },
  check: { minHeight: 44, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' }, checkOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, checkText: { color: colors.ink, fontSize: 12 }, checkTextOn: { color: colors.primary, fontWeight: '700' },
});
