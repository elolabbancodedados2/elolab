import { useState } from 'react';
import { Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, StateView, Stat } from '../../components/ui';
import { friendlyError, money, parseMoney } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Convenio = { id: string; nome: string; codigo: string; cnpj: string | null; telefone: string | null; email: string | null; valor_consulta: number | null; valor_retorno: number | null; carencia: number | null; prazo_retorno: number | null; ativo: boolean; registro_ans: string | null; codigo_operadora: string | null; versao_tiss: string | null; portal_url: string | null; responsavel_nome: string | null; responsavel_telefone: string | null; tipo_planos: string[] | null; updated_at: string | null };
type Exame = { id: string; tipo_exame: string; codigo_tuss: string | null; descricao: string | null; valor_tabela: number; valor_filme: number | null; valor_total: number | null };
type Filter = 'todos' | 'ativos' | 'inativos' | 'com_tabela';
type Form = { id: string | null; updatedAt: string | null; nome: string; codigo: string; telefone: string; email: string; consulta: string; retorno: string; carencia: string; prazo: string; ativo: boolean };

const columns = 'id, nome, codigo, cnpj, telefone, email, valor_consulta, valor_retorno, carencia, prazo_retorno, ativo, registro_ans, codigo_operadora, versao_tiss, portal_url, responsavel_nome, responsavel_telefone, tipo_planos, updated_at';
const normalize = (v: string | null | undefined) => (v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const onlyAlnum = (v: string | null | undefined) => (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const httpsUrl = (v: string | null) => { try { return v && new URL(v).protocol === 'https:' ? new URL(v).href : null; } catch { return null; } };
const blank: Form = { id: null, updatedAt: null, nome: '', codigo: '', telefone: '', email: '', consulta: '0', retorno: '0', carencia: '0', prazo: '30', ativo: true };
const numText = (v: number | null | undefined) => String(v ?? 0).replace('.', ',');

export default function ConveniosScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  // Same rules as getConveniosPermissions on the web: only admin manages convênios.
  const canManage = Boolean(profile?.roles.includes('admin'));
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [list, tables] = await Promise.all([
      client.from('convenios').select(columns).eq('clinica_id', clinicId).order('nome').order('id'),
      client.from('precos_exames_convenio').select('convenio_id').eq('clinica_id', clinicId),
    ]);
    return { list: (must(list) ?? []) as Convenio[], withTable: new Set<string>((must(tables) ?? []).map((r: { convenio_id: string }) => r.convenio_id)) };
  }, [clinicId]);

  const exams = useLoad(async client => {
    if (!clinicId || !openId) return undefined;
    return (must(await client.from('precos_exames_convenio').select('id, tipo_exame, codigo_tuss, descricao, valor_tabela, valor_filme, valor_total').eq('convenio_id', openId).eq('clinica_id', clinicId).order('tipo_exame')) ?? []) as Exame[];
  }, [clinicId, openId]);

  const all = data?.list ?? [];
  const withTable = data?.withTable ?? new Set<string>();
  const term = normalize(search.trim());
  const cnpjTerm = onlyAlnum(search.trim());
  const list = all.filter(c => (filter === 'ativos' ? c.ativo : filter === 'inativos' ? !c.ativo : filter === 'com_tabela' ? withTable.has(c.id) : true)
    && (normalize(c.nome).includes(term) || normalize(c.codigo).includes(term) || normalize(c.registro_ans).includes(term) || (cnpjTerm.length >= 3 && onlyAlnum(c.cnpj).includes(cnpjTerm))));
  const ativos = all.filter(c => c.ativo).length;

  async function toggle(c: Convenio) {
    if (!clinicId || !canManage) return;
    setBusy(c.id); setFeedback(null);
    try {
      const row = must(await db.from('convenios').update({ ativo: !c.ativo }).eq('id', c.id).eq('clinica_id', clinicId).select('id').maybeSingle());
      if (!row) throw new Error('O status não foi alterado. Verifique se você tem permissão para editar este convênio.');
      setFeedback({ message: c.ativo ? 'Convênio inativado.' : 'Convênio ativado.' });
    } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); reload(); }
  }

  function remove(c: Convenio) {
    Alert.alert('Excluir convênio?', `"${c.nome}" será excluído. Se houver pacientes, autorizações ou lotes vinculados, inative-o para preservar o histórico.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => void (async () => {
        setBusy(c.id); setFeedback(null);
        try {
          const { data: rows, error: err } = await db.from('convenios').delete().eq('id', c.id).eq('clinica_id', clinicId).select('id');
          if (err?.code === '23503') throw new Error('Este convênio possui pacientes, autorizações, preços ou lotes vinculados. Inative-o para preservar esses dados e o histórico.');
          if (err) throw err;
          if (!rows?.length) throw new Error('Sem permissão ou convênio já removido.');
          setOpenId(null);
          setFeedback({ message: 'Convênio excluído!' });
        } catch (e) { setFeedback({ message: friendlyError(e), error: true }); } finally { setBusy(null); reload(); }
      })() },
    ]);
  }

  async function save() {
    if (!form || !clinicId || !canManage) return;
    const nome = form.nome.trim(), codigo = form.codigo.trim().toUpperCase();
    const consulta = parseMoney(form.consulta), retorno = parseMoney(form.retorno);
    const carencia = Number(form.carencia), prazo = Number(form.prazo);
    if (!nome || !codigo) return setFeedback({ message: 'Nome e código são obrigatórios.', error: true });
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setFeedback({ message: 'E-mail do convênio inválido.', error: true });
    if (!(consulta >= 0) || !(retorno >= 0)) return setFeedback({ message: 'Informe valores válidos para consulta e retorno.', error: true });
    if (!Number.isInteger(carencia) || !Number.isInteger(prazo) || carencia < 0 || prazo < 0) return setFeedback({ message: 'Revise a carência e o prazo de retorno.', error: true });
    setBusy('form'); setFeedback(null);
    try {
      const payload = { nome, codigo, telefone: form.telefone.trim() || null, email: form.email.trim() || null, valor_consulta: consulta, valor_retorno: retorno, carencia, prazo_retorno: prazo, ativo: form.ativo };
      if (form.id) {
        if (!form.updatedAt) throw new Error('Não foi possível confirmar a versão deste convênio. Feche e abra o cadastro novamente antes de salvar.');
        const row = must(await db.from('convenios').update(payload).eq('id', form.id).eq('clinica_id', clinicId).eq('updated_at', form.updatedAt).select('id').maybeSingle());
        if (!row) throw new Error('Este convênio foi alterado ou removido em outra sessão. Seus dados continuam no formulário; reabra o cadastro e confira as alterações antes de salvar novamente.');
      } else {
        // Same defaults the web form sends for TISS fields not edited on the phone.
        const { error: err } = await db.from('convenios').insert({ ...payload, versao_tiss: '04.01.00', taxa_glosa: 0, clinica_id: clinicId });
        if (err?.code === '23505') throw new Error('Já existe um convênio com este código interno nesta clínica. Use outro código.');
        if (err) throw err;
      }
      setFeedback({ message: form.id ? 'Convênio atualizado!' : 'Convênio cadastrado!' });
      setForm(null);
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); }
  }

  const edit = (c: Convenio) => { setFeedback(null); setForm({ id: c.id, updatedAt: c.updated_at, nome: c.nome, codigo: c.codigo, telefone: c.telefone ?? '', email: c.email ?? '', consulta: numText(c.valor_consulta), retorno: numText(c.valor_retorno), carencia: String(c.carencia ?? 0), prazo: String(c.prazo_retorno ?? 30), ativo: c.ativo }); };

  return <ModuleScreen moduleKey="convenios" subtitle={all.length ? `${all.length} convênio(s) · ${ativos} ativo(s) · ${withTable.size} com tabela de exames` : 'Operadoras de saúde, faturamento TISS e tabelas de preços'} refreshing={refreshing} onRefresh={refresh}
    action={canManage && !form ? <Button label="Novo" icon="add" onPress={() => { setFeedback(null); setForm(blank); }} /> : null}>
    {form ? <Card style={styles.block}>
      <Text style={styles.formTitle}>{form.id ? 'Editar convênio' : 'Novo convênio'}</Text>
      <Field label="Nome *" value={form.nome} onChangeText={nome => setForm({ ...form, nome })} />
      <Field label="Código interno *" value={form.codigo} onChangeText={codigo => setForm({ ...form, codigo })} autoCapitalize="characters" />
      <Field label="Telefone" value={form.telefone} onChangeText={telefone => setForm({ ...form, telefone })} keyboardType="phone-pad" />
      <Field label="E-mail" value={form.email} onChangeText={email => setForm({ ...form, email })} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Valor da consulta (R$)" value={form.consulta} onChangeText={consulta => setForm({ ...form, consulta })} keyboardType="decimal-pad" />
      <Field label="Valor do retorno (R$)" value={form.retorno} onChangeText={retorno => setForm({ ...form, retorno })} keyboardType="decimal-pad" />
      <Field label="Carência (dias)" value={form.carencia} onChangeText={carencia => setForm({ ...form, carencia })} keyboardType="number-pad" />
      <Field label="Prazo de retorno (dias)" value={form.prazo} onChangeText={prazo => setForm({ ...form, prazo })} keyboardType="number-pad" />
      <Chips label="Status" options={[{ value: 'sim', label: 'Ativo' }, { value: 'nao', label: 'Inativo' }]} value={form.ativo ? 'sim' : 'nao'} onChange={v => setForm({ ...form, ativo: v === 'sim' })} />
      <Text style={styles.note}>CNPJ, registro ANS, TISS, portal, responsável e planos são editados no navegador.</Text>
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setForm(null)} /><Button label="Salvar" icon="checkmark" loading={busy === 'form'} onPress={() => void save()} /></View>
    </Card> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando convênios…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os convênios" message={error} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Ativos" value={ativos} tone="success" onPress={() => setFilter(filter === 'ativos' ? 'todos' : 'ativos')} />
        <Stat label="Inativos" value={all.length - ativos} tone="neutral" onPress={() => setFilter(filter === 'inativos' ? 'todos' : 'inativos')} />
        <Stat label="Com tabela de exames" value={withTable.size} onPress={() => setFilter(filter === 'com_tabela' ? 'todos' : 'com_tabela')} />
        <Stat label="Todos" value={all.length} tone="info" onPress={() => setFilter('todos')} />
      </View>
      <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Nome, código, ANS ou CNPJ" autoCorrect={false} />
      <Chips options={[{ value: 'todos', label: 'Todos' }, { value: 'ativos', label: 'Ativos' }, { value: 'inativos', label: 'Inativos' }, { value: 'com_tabela', label: 'Com tabela' }]} value={filter} onChange={setFilter} />
      {!list.length ? <StateView icon="business-outline" title={all.length ? 'Nenhum convênio corresponde à busca' : 'Nenhum convênio cadastrado ainda'} message={all.length ? 'Ajuste a busca ou o filtro de status para ver todos os convênios.' : 'Cadastre as operadoras aceitas para liberar autorizações, tabelas de exames e faturamento TISS.'} /> :
        <Section title={`${list.length} de ${all.length} convênio(s)`}>{list.map(c => {
          const open = openId === c.id;
          const portal = httpsUrl(c.portal_url);
          return <View key={c.id}>
            <ListRow title={c.nome} subtitle={[c.codigo, c.registro_ans ? `ANS ${c.registro_ans}` : null, withTable.has(c.id) ? 'Tabela de exames' : null].filter(Boolean).join(' · ')} meta={`Consulta ${money(c.valor_consulta)} · Retorno ${money(c.valor_retorno)}`} icon="business-outline" tone={c.ativo ? 'primary' : 'neutral'}
              right={<Badge label={c.ativo ? 'Ativo' : 'Inativo'} tone={c.ativo ? 'success' : 'neutral'} />} onPress={() => setOpenId(open ? null : c.id)} accessibilityLabel={`${c.nome}, ${c.ativo ? 'ativo' : 'inativo'}. ${open ? 'Ocultar detalhes' : 'Ver detalhes'}`} />
            {open ? <Card style={styles.block}>
              {([['CNPJ', c.cnpj], ['Operadora', c.codigo_operadora], ['Versão TISS', c.versao_tiss || '04.01.00'], ['Prazo de retorno', `${c.prazo_retorno ?? 30} dias`], ['Carência', `${c.carencia ?? 0} dias`], ['Telefone', c.telefone], ['E-mail', c.email], ['Responsável', [c.responsavel_nome, c.responsavel_telefone].filter(Boolean).join(' · ')], ['Planos', c.tipo_planos?.join(', ')]] as [string, string | null | undefined][]).filter(([, v]) => v).map(([k, v]) => <Text key={k} style={styles.info}><Text style={styles.infoLabel}>{k}: </Text>{v}</Text>)}
              {portal ? <View style={styles.actions}><Button variant="secondary" icon="open-outline" label="Portal do convênio" onPress={() => void Linking.openURL(portal)} /><Button variant="ghost" icon="share-outline" label="Compartilhar link" onPress={() => void Share.share({ message: portal })} /></View> : null}
              <Text style={styles.subTitle}>Tabela de preços de exames</Text>
              {exams.loading ? <StateView loading title="Carregando tabela…" /> : exams.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar a tabela de exames" message={exams.error} onAction={exams.reload} /> : !exams.data?.length ? <Text style={styles.note}>Nenhum exame cadastrado nesta tabela.</Text> :
                exams.data.map(e => <ListRow key={e.id} title={e.tipo_exame} subtitle={[e.codigo_tuss ? `TUSS ${e.codigo_tuss}` : null, e.descricao].filter(Boolean).join(' · ') || null} right={<Text style={styles.price}>{money(e.valor_total || e.valor_tabela + (e.valor_filme || 0))}</Text>} />)}
              <View style={styles.actions}>
                {canManage ? <Button variant="secondary" label="Editar" icon="create-outline" disabled={busy === c.id} onPress={() => edit(c)} /> : null}
                {canManage ? <Button variant="secondary" label={c.ativo ? 'Inativar' : 'Ativar'} icon="power-outline" loading={busy === c.id} onPress={() => void toggle(c)} /> : null}
                {canManage ? <Button variant="danger" label="Excluir" disabled={busy === c.id} onPress={() => remove(c)} /> : null}
              </View>
              <OpenOnWeb path="/convenios" label="Tabela de exames e TISS no navegador" />
            </Card> : null}
          </View>;
        })}</Section>}
    </>}
    <Text style={styles.note}>Edição da tabela de exames, dados TISS e faturamento ficam no navegador, onde há espaço para as tabelas.</Text>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  block: { marginVertical: 8 }, formTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 12 }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginVertical: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 }, info: { color: colors.ink, fontSize: 12, lineHeight: 19 }, infoLabel: { color: colors.muted, fontWeight: '700' },
  subTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 12 }, price: { color: colors.ink, fontSize: 12, fontWeight: '700' }, note: { color: colors.muted, fontSize: 11, lineHeight: 16, marginVertical: 8 },
});
