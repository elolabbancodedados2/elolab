import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, Section, Stat, StateView } from '../../components/ui';
import { friendlyError, parseDateBR } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Stage = 'created' | 'configuration' | 'team' | 'operational' | 'completed' | 'blocked';
type Item = { clinica_id: string; clinica_nome: string; stage: Stage; owner_id?: string | null; next_action?: string | null; due_at?: string | null; team_size: number; has_config: boolean; has_services: boolean; has_activity: boolean; readiness: number };
type Owner = { user_id: string; nome: string; email: string | null };

const stageLabels: Record<Stage, string> = { created: 'Criada', configuration: 'Configuração', team: 'Equipe', operational: 'Em operação', completed: 'Concluído', blocked: 'Bloqueado' };
const stageOptions = (Object.keys(stageLabels) as Stage[]).map(value => ({ value, label: stageLabels[value] }));
const spDate = (v: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v));
const dueTs = (v?: string | null) => { if (!v) return null; const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };
const overdue = (i: Item) => { const d = dueTs(i.due_at); return d !== null && d < Date.now() && i.stage !== 'completed'; };
// shortcut: São Paulo has had a fixed -03:00 offset since 2019; revisit if DST returns.
const endOfDaySP = (iso: string) => new Date(`${iso}T23:59:59.999-03:00`).toISOString();

export default function AdminOnboardingScreen() {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [form, setForm] = useState<{ item: Item; stage: Stage; nextAction: string; due: string; owner: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [overview, admins] = await Promise.all([
      client.rpc('platform_onboarding_overview'),
      client.from('platform_admins').select('user_id,nivel').eq('ativo', true).order('created_at'),
    ]);
    const clinics = (must<{ clinics?: Item[] }>(overview)?.clinics ?? []) as Item[];
    let owners: Owner[] | null = null;
    if (!admins.error) {
      const ids = (admins.data ?? []).map((a: { user_id: string }) => a.user_id);
      const profiles = ids.length ? await client.from('profiles').select('id,nome,email').in('id', ids) : { data: [], error: null };
      if (!profiles.error) {
        const map = new Map<string, { nome: string; email: string | null }>((profiles.data ?? []).map((p: { id: string; nome: string; email: string | null }) => [p.id, p]));
        owners = ids.map((id: string) => ({ user_id: id, nome: map.get(id)?.nome || 'Administrador sem nome', email: map.get(id)?.email || null }));
      }
    }
    return { clinics, owners };
  }, []);

  const clinics = [...(data?.clinics ?? [])].sort((a, b) => {
    const ad = dueTs(a.due_at), bd = dueTs(b.due_at);
    if (overdue(a) !== overdue(b)) return overdue(a) ? -1 : 1;
    if (ad !== null && bd !== null && ad !== bd) return ad - bd;
    if (ad !== null && bd === null) return -1;
    if (ad === null && bd !== null) return 1;
    return a.readiness - b.readiness || a.clinica_nome.localeCompare(b.clinica_nome, 'pt-BR');
  });
  const owners = data?.owners;
  const ownerName = (id?: string | null) => owners?.find(o => o.user_id === id)?.nome;
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const visible = clinics.filter(i => (stageFilter === 'all' || i.stage === stageFilter) && (!onlyOverdue || overdue(i)) && (!term || `${i.clinica_nome} ${i.next_action || ''} ${ownerName(i.owner_id) || ''} ${owners?.find(o => o.user_id === i.owner_id)?.email || ''}`.toLocaleLowerCase('pt-BR').includes(term)));
  const nOver = clinics.filter(overdue).length, nBlocked = clinics.filter(i => i.stage === 'blocked').length, nDone = clinics.filter(i => i.stage === 'completed').length;
  const hasFilter = stageFilter !== 'all' || onlyOverdue || !!term;

  async function save() {
    if (!form || busy) return;
    const { stage } = form;
    if (stage !== 'completed' && form.nextAction.trim().length < 3) return setFeedback({ message: stage === 'blocked' ? 'Descreva o bloqueio ou o próximo passo necessário.' : 'Informe a próxima ação para manter o onboarding acionável.', error: true });
    const iso = stage === 'completed' || !form.due.trim() ? null : parseDateBR(form.due);
    if (form.due.trim() && stage !== 'completed' && !iso) return setFeedback({ message: 'Informe uma data válida para o acompanhamento.', error: true });
    setBusy(true); setFeedback(null);
    try {
      must(await db.rpc('platform_update_onboarding', { p_clinica_id: form.item.clinica_id, p_stage: stage, p_next_action: stage === 'completed' ? null : form.nextAction.trim() || null, p_due_at: iso ? endOfDaySP(iso) : null, p_owner_id: form.owner === 'unassigned' ? null : form.owner }));
      setForm(null); setFeedback({ message: 'Onboarding atualizado.' }); reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível atualizar o onboarding.'), error: true }); } finally { setBusy(false); }
  }

  return <ModuleScreen moduleKey="admin-onboarding" subtitle={data ? `${clinics.length} clínicas ativas · ${nOver} acompanhamentos atrasados${nBlocked ? ` · ${nBlocked} bloqueadas` : ''}` : 'Acompanhe prontidão, etapa, próxima ação e prazo de ativação por clínica.'} refreshing={refreshing} onRefresh={refresh}>
    {form ? <Card style={styles.gap}>
      <Text style={styles.title}>Plano de ativação · {form.item.clinica_nome}</Text>
      <Text style={styles.muted}>Registre uma etapa, ação concreta e prazo para o próximo acompanhamento.</Text>
      <Chips label="Etapa" options={stageOptions} value={form.stage} onChange={stage => setForm({ ...form, stage })} />
      {form.stage === 'completed' ? <Text style={styles.muted}>Ao concluir, a próxima ação e o prazo serão limpos do acompanhamento.</Text> : <>
        <Field label={form.stage === 'blocked' ? 'Bloqueio ou próximo passo necessário' : 'Próxima ação'} value={form.nextAction} maxLength={500} multiline onChangeText={nextAction => setForm({ ...form, nextAction })} placeholder={form.stage === 'blocked' ? 'Ex.: aguardar envio dos dados pelo responsável da clínica' : 'Ex.: concluir cadastro de serviços com a clínica'} hint={`${form.nextAction.length}/500 caracteres · obrigatório, mínimo de 3.`} />
        <Field label="Prazo para acompanhamento" value={form.due} onChangeText={due => setForm({ ...form, due })} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" hint="O prazo vale até 23:59, horário de São Paulo." />
      </>}
      {owners ? <>
        <Chips label="Responsável da plataforma" options={[{ value: 'unassigned', label: 'Sem responsável' }, ...owners.map(o => ({ value: o.user_id, label: o.nome }))]} value={form.owner} onChange={owner => setForm({ ...form, owner })} />
        {form.owner !== 'unassigned' && !owners.some(o => o.user_id === form.owner) ? <Text style={styles.warn}>O responsável salvo não está ativo. Atribua outro responsável ou selecione “Sem responsável”.</Text> : null}
        {!owners.length ? <Text style={styles.muted}>Nenhum administrador ativo disponível.</Text> : null}
      </> : <Text accessibilityRole="alert" style={styles.err}>Não foi possível carregar responsáveis. O responsável atual será mantido.</Text>}
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={busy} onPress={() => setForm(null)} /><Button label="Salvar acompanhamento" loading={busy} onPress={() => void save()} /></View>
    </Card> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando clínicas…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os onboardings." message={error} onAction={reload} /> : !clinics.length ? <StateView icon="business-outline" title="Nenhuma clínica para acompanhar." message="Novas clínicas entram aqui assim que o cadastro é concluído." /> : <>
      <View style={styles.grid}>
        <Stat label="Clínicas em acompanhamento" value={clinics.length} onPress={() => { setStageFilter('all'); setOnlyOverdue(false); }} />
        <Stat label="Atrasados" value={nOver} tone="danger" onPress={() => setOnlyOverdue(v => !v)} />
        <Stat label="Bloqueados" value={nBlocked} tone="warning" onPress={() => setStageFilter(f => f === 'blocked' ? 'all' : 'blocked')} />
        <Stat label="Concluídos" value={nDone} tone="success" onPress={() => setStageFilter(f => f === 'completed' ? 'all' : 'completed')} />
      </View>
      <Section title="Clínicas" action={<Text style={styles.muted}>{visible.length} de {clinics.length}</Text>}>
        <Field label="Buscar onboarding" value={search} onChangeText={setSearch} placeholder="Buscar clínica, responsável ou próxima ação" />
        <Chips label="Etapa" options={[{ value: 'all', label: 'Todas as etapas' }, ...stageOptions]} value={stageFilter} onChange={setStageFilter} />
        {hasFilter ? <Button variant="ghost" label="Limpar filtros" onPress={() => { setStageFilter('all'); setOnlyOverdue(false); setSearch(''); }} /> : null}
        {!visible.length ? <StateView icon="search-outline" title="Nenhum onboarding corresponde à busca e à etapa selecionadas." /> : visible.map(i => {
          const pct = Math.max(0, Math.min(100, i.readiness));
          return <Card key={i.clinica_id} style={[styles.item, overdue(i) && { borderColor: colors.danger }]}>
            <View style={styles.row}><Text style={[styles.title, styles.fill]}>{i.clinica_nome}</Text><Badge label={stageLabels[i.stage] || i.stage} tone={i.stage === 'blocked' ? 'danger' : i.stage === 'completed' ? 'success' : 'neutral'} /></View>
            <Text style={styles.muted}>Próxima ação: {i.next_action || 'Ainda não definida'}{i.owner_id ? ` · Responsável: ${ownerName(i.owner_id) || 'Administrador atribuído'}` : ''}{i.due_at ? ` · Prazo ${spDate(i.due_at)}` : ''}</Text>
            {overdue(i) ? <Text style={styles.err}>Acompanhamento atrasado</Text> : null}
            <View accessible accessibilityRole="progressbar" accessibilityLabel={`Checklist automático de ${i.clinica_nome}`} accessibilityValue={{ min: 0, max: 100, now: pct }} style={styles.bar}><View style={[styles.fillBar, { width: `${pct}%` }]} /></View>
            <Text style={styles.muted}>{i.readiness}% · checklist automático: configuração, serviços, equipe e primeiro agendamento.</Text>
            <View style={styles.row}>{([['Configuração', i.has_config], ['Serviços', i.has_services], [`Equipe (${i.team_size})`, i.team_size > 1], ['Primeiro uso', i.has_activity]] as [string, boolean][]).map(([label, done]) => <Badge key={label} label={`${done ? '✓' : '○'} ${label}`} tone={done ? 'primary' : 'neutral'} />)}</View>
            <Button label="Atualizar plano" onPress={() => { setForm({ item: i, stage: i.stage, nextAction: i.next_action || '', due: i.due_at ? spDate(i.due_at) : '', owner: i.owner_id || 'unassigned' }); setFeedback(null); }} />
          </Card>;
        })}
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }, fill: { flex: 1 }, gap: { gap: 8, marginBottom: 6 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  item: { marginBottom: 10, gap: 8, padding: 12 }, bar: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }, fillBar: { height: 8, backgroundColor: colors.primary },
  title: { color: colors.ink, fontSize: 13, fontWeight: '700' }, muted: { color: colors.muted, fontSize: 11, lineHeight: 16 }, err: { color: colors.danger, fontSize: 11, fontWeight: '700' }, warn: { color: colors.warning, fontSize: 11 },
});
