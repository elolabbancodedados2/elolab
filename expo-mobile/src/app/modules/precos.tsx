import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Feedback, Field, ListRow, Section, Segmented, StateView } from '../../components/ui';
import { friendlyError, money, parseMoney } from '../../lib/format';
import { db, must, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Tab = 'consultas' | 'particular' | 'convenio';
type Tipo = { id: string; nome: string; duracao_minutos: number; valor_particular: number; ativo: boolean };
type Interno = { nome: string; codigo_tuss?: string; descricao?: string; valor: number; custo?: number };
type PrecoConvenio = { id: string; tipo_exame: string; codigo_tuss: string | null; valor_tabela: number; valor_filme: number | null; valor_custo: number | null; valor_repasse: number | null; valor_total: number | null; updated_at: string | null; convenio_id: string; convenios: { nome: string } | null };
type Edit = { key: string; label: string; current: number; value: string; allowZero: boolean; save: (valor: number) => Promise<void> };

const LIMIT = 20000;
const PAGE = 80;
const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
const input = (v: number) => Number(v || 0).toFixed(2).replace('.', ',');
async function fetchAll<T>(build: () => Db): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < LIMIT) {
    const batch = (must<T[]>(await build().range(rows.length, rows.length + 999)) ?? []);
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

export default function PricesScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [tab, setTab] = useState<Tab>('consultas');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [tipos, interno, convenio] = await Promise.all([
      fetchAll<Tipo>(() => client.from('tipos_consulta').select('id, nome, duracao_minutos, valor_particular, ativo').eq('clinica_id', clinicId).order('nome').order('id')),
      client.from('configuracoes_clinica').select('valor, updated_at').eq('chave', 'precos_exames_internos').eq('clinica_id', clinicId).order('updated_at', { ascending: false }).limit(1),
      fetchAll<PrecoConvenio>(() => client.from('precos_exames_convenio').select('*, convenios(nome, codigo)').eq('clinica_id', clinicId).order('tipo_exame').order('id')),
    ]);
    const row = (must<{ valor: Interno[] | null; updated_at: string | null }[]>(interno) ?? [])[0];
    return { tipos, internos: { items: (row?.valor ?? []) as Interno[], updatedAt: row?.updated_at ?? null }, convenio };
  }, [clinicId]);

  const term = norm(search.trim());
  const tipos = (data?.tipos ?? []).filter(t => !term || norm(t.nome).includes(term));
  const internos = (data?.internos.items ?? []).map((item, index) => ({ item, index })).filter(({ item }) => !term || norm(item.nome).includes(term) || norm(item.codigo_tuss).includes(term));
  const convenio = (data?.convenio ?? []).filter(p => !term || norm(p.tipo_exame).includes(term) || norm(p.codigo_tuss).includes(term) || norm(p.convenios?.nome).includes(term));
  const listSize = tab === 'consultas' ? tipos.length : tab === 'particular' ? internos.length : convenio.length;

  async function save() {
    if (!edit || busy) return;
    const valor = parseMoney(edit.value);
    if (!Number.isFinite(valor) || valor < 0 || (!edit.allowZero && valor === 0)) return setFeedback({ message: edit.allowZero ? 'Informe um valor válido, igual ou maior que zero, com até duas casas decimais.' : 'Informe um valor válido maior que zero, com até duas casas decimais.', error: true });
    setBusy(true); setFeedback(null);
    try {
      await edit.save(valor);
      setFeedback({ message: `Preço de ${edit.label} atualizado para ${money(valor)}.` });
      setEdit(null);
    } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(false); reload(); }
  }

  const editTipo = (t: Tipo) => setEdit({ key: t.id, label: t.nome, current: t.valor_particular, value: input(t.valor_particular), allowZero: true, save: async valor => {
    const row = must(await db.from('tipos_consulta').update({ valor_particular: valor }).eq('id', t.id).eq('clinica_id', clinicId).select('id').maybeSingle());
    if (!row) throw new Error('Tipo não encontrado ou sem permissão para alterar.');
  } });
  // The clinic's private exam table is one JSON row; save with the version read, like salvarConfigClinica.
  const editInterno = (item: Interno, index: number) => setEdit({ key: `i${index}`, label: item.nome, current: item.valor, value: input(item.valor), allowZero: false, save: async valor => {
    const updatedAt = data?.internos.updatedAt;
    if (!updatedAt) throw new Error('A tabela não foi carregada por completo. Atualize os dados antes de salvar para não substituir preços existentes.');
    const list = [...(data?.internos.items ?? [])];
    if (list[index]?.nome !== item.nome) throw new Error('A tabela mudou desde a leitura. Atualize os dados antes de salvar.');
    list[index] = { ...item, valor };
    const rows = must<{ id: string }[]>(await db.from('configuracoes_clinica').update({ valor: list, updated_at: new Date().toISOString() }).eq('clinica_id', clinicId).eq('chave', 'precos_exames_internos').eq('updated_at', updatedAt).select('id'));
    if (!rows?.length) throw new Error('Outra pessoa atualizou esta tabela de preços. Atualize os dados antes de salvar novamente.');
  } });
  const editConvenio = (p: PrecoConvenio) => setEdit({ key: p.id, label: `${p.tipo_exame} (${p.convenios?.nome ?? 'convênio'})`, current: p.valor_tabela, value: input(p.valor_tabela), allowZero: false, save: async valor => {
    if (!p.updated_at) throw new Error('Não foi possível confirmar a versão deste preço. Atualize a lista antes de editar.');
    const row = must(await db.from('precos_exames_convenio').update({ valor_tabela: valor }).eq('id', p.id).eq('clinica_id', clinicId).eq('updated_at', p.updated_at).select('id, updated_at').maybeSingle());
    if (!row) throw new Error('Este preço foi alterado ou removido em outra sessão. Atualize a tabela e compare antes de salvar novamente.');
  } });

  const editor = (key: string) => edit?.key === key ? <Card style={styles.form}>
    <Field label="Novo valor (R$)" value={edit.value} onChangeText={value => setEdit({ ...edit, value })} keyboardType="decimal-pad" autoFocus hint={`Valor atual: ${money(edit.current)}`} />
    <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={busy} onPress={() => setEdit(null)} /><Button icon="checkmark" label="Salvar preço" loading={busy} onPress={() => void save()} /></View>
  </Card> : null;
  const editButton = (onPress: () => void) => <View style={styles.actions}><Button variant="secondary" icon="create-outline" label="Alterar preço" disabled={busy} onPress={() => { setFeedback(null); onPress(); }} /></View>;

  return <ModuleScreen moduleKey="precos" title="Preços e serviços" subtitle={data ? `${data.tipos.length} tipo(s) de consulta · ${data.internos.items.length} exame(s) particular(es) · ${data.convenio.length} preço(s) de convênio` : 'Tabela de preços de consultas e exames.'} refreshing={refreshing} onRefresh={refresh}>
    <Segmented options={[{ value: 'consultas', label: 'Consultas' }, { value: 'particular', label: 'Exames' }, { value: 'convenio', label: 'Por convênio' }]} value={tab} onChange={value => { setTab(value); setShown(PAGE); setEdit(null); }} />
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Field label="Buscar" value={search} onChangeText={v => { setSearch(v); setShown(PAGE); }} placeholder={tab === 'consultas' ? 'Nome do tipo de consulta' : 'Exame, TUSS ou convênio'} />
    {loading ? <StateView loading title="Carregando preços…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os preços" message={error} onAction={reload} /> : !listSize ? <StateView icon="pricetags-outline" title="Nada por aqui" message={term ? 'Nenhum preço encontrado com esta busca.' : 'Nenhum preço cadastrado. Cadastre no navegador.'} /> : <>
      {(data?.convenio.length ?? 0) >= LIMIT ? <Text accessibilityRole="alert" style={styles.warn}>A lista de preços por convênio atingiu o limite de {LIMIT.toLocaleString('pt-BR')} itens.</Text> : null}
      {tab === 'consultas' ? <Section title={`${tipos.length} tipo(s) de consulta`}>{tipos.slice(0, shown).map(t => <View key={t.id}>
        <ListRow icon="medkit-outline" title={t.nome} meta={`${t.duracao_minutos} min · Particular ${money(t.valor_particular)}`} right={t.ativo ? undefined : <Badge label="Inativo" />} />
        {editor(t.id) ?? editButton(() => editTipo(t))}
      </View>)}</Section> : tab === 'particular' ? <Section title={`${internos.length} exame(s) particular(es)`}>{internos.slice(0, shown).map(({ item, index }) => <View key={`${index}-${item.nome}`}>
        <ListRow icon="flask-outline" title={item.nome} subtitle={item.descricao || null} meta={[item.codigo_tuss ? `TUSS ${item.codigo_tuss}` : null, `Valor ${money(item.valor)}`, item.custo ? `Custo ${money(item.custo)}` : null].filter(Boolean).join(' · ')} />
        {editor(`i${index}`) ?? editButton(() => editInterno(item, index))}
      </View>)}</Section> : <Section title={`${convenio.length} preço(s) de convênio`}>{convenio.slice(0, shown).map(p => <View key={p.id}>
        <ListRow icon="business-outline" title={p.tipo_exame} subtitle={p.convenios?.nome ?? null}
          meta={[p.codigo_tuss ? `TUSS ${p.codigo_tuss}` : null, `Tabela ${money(p.valor_tabela)}`, p.valor_filme ? `Filme ${money(p.valor_filme)}` : null, `Total ${money(p.valor_total || p.valor_tabela)}`].filter(Boolean).join(' · ')} />
        {editor(p.id) ?? editButton(() => editConvenio(p))}
      </View>)}</Section>}
      {listSize > shown ? <Button variant="secondary" label={`Mostrar mais (${listSize - shown} restantes)`} onPress={() => setShown(shown + PAGE)} /> : null}
    </>}
    <Section title="No navegador">
      <Text style={styles.note}>Cadastro e exclusão de preços, duração, cor e preparo dos tipos de consulta, valores de consulta por convênio e custo, filme e repasse dos exames ficam no navegador.</Text>
      <OpenOnWeb path={tab === 'consultas' ? '/precos-servicos?tab=tipos' : '/precos-servicos'} />
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  form: { marginVertical: 6 }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingVertical: 6 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12, fontSize: 12, marginBottom: 10 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
});
