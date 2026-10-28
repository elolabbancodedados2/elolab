import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Chips, Feedback, Field, ListRow, Section, Segmented, StateView } from '../../components/ui';
import { friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Medico = { id: string; nome: string | null; crm: string | null; tipo_registro: string | null; crm_uf: string | null; especialidade: string | null; email: string | null; telefone: string | null; ativo: boolean; updated_at: string | null };
type Func = { id: string; nome: string; email: string | null; cargo: string | null; departamento: string | null; ativo: boolean | null; edit_version: number; user_id: string | null; pending_roles: string[] | null };
type Tab = 'medicos' | 'funcionarios';
type Status = 'todos' | 'ativo' | 'inativo' | 'sem_permissao';

const roleLabel: Record<string, string> = { admin: 'Administrador', medico: 'Médico', recepcao: 'Recepção', enfermagem: 'Enfermagem', financeiro: 'Financeiro' };
const normalize = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

export default function TeamScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [tab, setTab] = useState<Tab>('medicos');
  const [status, setStatus] = useState<Status>('todos');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  // Same admin-only RPCs as the web Equipe page (they already scope to the caller's clinic).
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [medicos, funcs] = await Promise.all([client.rpc('listar_medicos_equipe_admin'), client.rpc('listar_funcionarios_equipe_admin')]);
    return { medicos: (must(medicos) ?? []) as Medico[], funcs: (must(funcs) ?? []) as Func[] };
  }, [clinicId]);

  const term = normalize(search.trim());
  const medicos = (data?.medicos ?? []).filter(m => (!term || normalize(`${m.nome || ''} ${m.crm || ''} ${m.especialidade || ''} ${m.email || ''}`).includes(term)) && (status === 'todos' || status === 'sem_permissao' || (status === 'ativo' ? m.ativo : !m.ativo)));
  const funcs = (data?.funcs ?? []).filter(f => (!term || normalize(`${f.nome} ${f.email || ''}`).includes(term))
    && (status === 'todos' || (status === 'ativo' && f.ativo) || (status === 'inativo' && !f.ativo) || (status === 'sem_permissao' && f.ativo && !(f.pending_roles ?? []).length)));
  const all = data?.funcs ?? [];
  const semPermissao = all.filter(f => f.ativo && !(f.pending_roles ?? []).length).length;

  async function run(id: string, action: () => Promise<string>) {
    setBusy(id);
    setFeedback(null);
    try { setFeedback({ message: await action() }); } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); reload(); }
  }

  function toggleMedico(m: Medico) {
    if (m.ativo) {
      return Alert.alert('Inativar médico', 'O médico deixará de aparecer como opção para novos atendimentos. O cadastro e o histórico de agenda, prontuários e prescrições serão preservados. Esta ação não revoga o acesso ao sistema; ajuste as permissões na aba Funcionários. Você poderá reativá-lo depois.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Inativar médico', style: 'destructive', onPress: () => void run(m.id, async () => {
          const row = must(await db.from('medicos').update({ ativo: false }).eq('id', m.id).eq('clinica_id', clinicId).eq('ativo', true).select('id').maybeSingle());
          if (!row) throw new Error('O médico já foi inativado ou não pertence à clínica atual. Atualize a lista.');
          return 'Médico inativado. O histórico e os vínculos foram preservados.';
        }) },
      ]);
    }
    void run(m.id, async () => {
      // Reactivation mirrors the web edit form: optimistic concurrency on updated_at.
      let query = db.from('medicos').update({ ativo: true }).eq('id', m.id).eq('clinica_id', clinicId);
      query = m.updated_at ? query.eq('updated_at', m.updated_at) : query.is('updated_at', null);
      if (!must(await query.select('id').maybeSingle())) throw new Error('Este cadastro foi alterado por outra pessoa ou removido. Atualize a lista e confira os dados antes de salvar novamente.');
      return 'Médico reativado.';
    });
  }

  function toggleFunc(f: Func) {
    const next = !f.ativo;
    // Same audited path as the web edit form: sync_employee_roles_if_unchanged sets ativo, roles and sessions atomically.
    const go = () => void run(f.id, async () => {
      const { error: rpcError } = await db.rpc('sync_employee_roles_if_unchanged', { _funcionario_id: f.id, _user_id: f.user_id, _roles: f.pending_roles ?? [], _ativo: next, _expected_version: f.edit_version });
      if (rpcError) throw new Error(rpcError.code === '40001' ? 'Outra pessoa alterou esta ficha. Atualize a lista e tente novamente.' : rpcError.message);
      return next ? 'Funcionário reativado.' : 'Funcionário inativado e sessões encerradas. Uma sessão já aberta pode continuar válida até o token atual expirar.';
    });
    if (next) return go();
    Alert.alert('Inativar funcionário', `${f.nome} perde o acesso ao sistema e as sessões abertas são encerradas. Você poderá reativá-lo depois.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Inativar', style: 'destructive', onPress: go }]);
  }

  function invite(f: Func) {
    const roles = f.pending_roles ?? [];
    if (!f.ativo) return setFeedback({ message: 'Ative o funcionário antes de enviar o convite.', error: true });
    if (!f.email) return setFeedback({ message: 'Cadastre um e-mail primeiro', error: true });
    if (!roles.length) return setFeedback({ message: 'Defina a função deste funcionário antes de convidar. Sem função, ele entra no sistema e não vê nenhuma tela.', error: true });
    void run(f.id, async () => {
      const { data: res, error: fnError } = await db.functions.invoke('invite-employee', { body: { email: f.email, nome: f.nome, roles } });
      if (fnError) throw new Error(fnError.message || 'Erro ao enviar convite');
      if (!res?.success) throw new Error(res?.error || 'Erro ao enviar convite');
      return res.emailStatus === 'sent' ? 'Convite enviado por e-mail.' : 'Convite criado, mas o e-mail não foi enviado. Acesse a lista de convites para copiar o link e compartilhar.';
    });
  }

  const subtitle = data ? `${data.medicos.length} médico(s) · ${all.length} funcionário(s)${semPermissao ? ` · ${semPermissao} sem permissão` : ''}` : 'Médicos e funcionários da clínica.';
  const statusOptions: { value: Status; label: string }[] = [{ value: 'todos', label: 'Todos' }, { value: 'ativo', label: 'Ativos' }, { value: 'inativo', label: 'Inativos' }, ...(tab === 'funcionarios' ? [{ value: 'sem_permissao' as Status, label: 'Sem permissão' }] : [])];

  return <ModuleScreen moduleKey="equipe" subtitle={subtitle} refreshing={refreshing} onRefresh={refresh}
    action={<Button variant="secondary" icon="mail-outline" label="Convites" onPress={() => router.push('/modules/convites')} />}>
    <Segmented options={[{ value: 'medicos', label: 'Equipe Médica' }, { value: 'funcionarios', label: 'Funcionários' }]} value={tab} onChange={value => { setTab(value); if (status === 'sem_permissao') setStatus('todos'); }} />
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Field label="Buscar" value={search} onChangeText={setSearch} placeholder={tab === 'medicos' ? 'Nome, CRM, especialidade ou e-mail' : 'Nome ou e-mail'} autoCorrect={false} autoCapitalize="none" />
    <Chips label="Status" options={statusOptions} value={status} onChange={setStatus} />
    {loading ? <StateView loading title="Carregando equipe…" /> : error ? <StateView icon="alert-circle-outline" title={tab === 'medicos' ? 'Não foi possível carregar o corpo clínico' : 'Não foi possível carregar os funcionários'} message={error} onAction={reload} />
      : tab === 'medicos' ? (!medicos.length ? <StateView icon="medkit-outline" title="Nenhum médico encontrado" message={data?.medicos.length ? 'Limpe a busca ou o filtro para ver todos.' : 'Cadastre médicos pelo navegador.'} /> :
        <Section title={`${medicos.length} médico(s)`}>{medicos.map(m => <View key={m.id}>
          <ListRow icon="medkit-outline" tone={m.ativo ? 'primary' : 'neutral'} title={m.nome || m.crm || 'Sem nome'} subtitle={[m.especialidade, m.crm ? `${m.tipo_registro || 'CRM'} ${m.crm}${m.crm_uf ? `/${m.crm_uf}` : ''}` : null].filter(Boolean).join(' · ')} meta={m.email || m.telefone}
            right={<Badge label={m.ativo ? 'Ativo' : 'Inativo'} tone={m.ativo ? 'success' : 'neutral'} />} />
          <View style={styles.actions}><Button variant={m.ativo ? 'danger' : 'secondary'} label={m.ativo ? 'Inativar' : 'Reativar'} loading={busy === m.id} disabled={!!busy} onPress={() => toggleMedico(m)} /></View>
        </View>)}</Section>)
      : (!funcs.length ? <StateView icon="people-outline" title="Nenhum funcionário encontrado" message={all.length ? 'Limpe a busca ou o filtro para ver todos.' : 'Cadastre funcionários pelo navegador.'} /> :
        <Section title={`${funcs.length} funcionário(s)`}>{funcs.map(f => {
          const roles = f.pending_roles ?? [];
          return <View key={f.id}>
            <ListRow icon="person-outline" tone={f.ativo ? 'primary' : 'neutral'} title={f.nome} subtitle={[f.cargo, f.departamento, f.email].filter(Boolean).join(' · ')}
              meta={roles.length ? roles.map(r => roleLabel[r] ?? r).join(', ') : 'Sem função definida'} right={<Badge label={f.ativo ? (roles.length ? 'Ativo' : 'Sem permissão') : 'Inativo'} tone={f.ativo ? (roles.length ? 'success' : 'warning') : 'neutral'} />} />
            <View style={styles.actions}>
              {!f.user_id && f.email && f.ativo ? <Button variant="secondary" icon="mail-outline" label="Enviar convite" disabled={!!busy} onPress={() => invite(f)} /> : null}
              <Button variant={f.ativo ? 'danger' : 'secondary'} label={f.ativo ? 'Inativar' : 'Reativar'} loading={busy === f.id} disabled={!!busy} onPress={() => toggleFunc(f)} />
            </View>
          </View>;
        })}</Section>)}
    <Section title="No navegador">
      <Text style={styles.note}>Cadastro e edição completa (registro profissional, foto, carimbo, funções e personalização de perfis), exclusão e disponibilidade dos médicos ficam no navegador.</Text>
      <OpenOnWeb path={tab === 'medicos' ? '/equipe' : '/equipe?aba=funcionarios'} label="Abrir equipe no navegador" />
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({ actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 } });
