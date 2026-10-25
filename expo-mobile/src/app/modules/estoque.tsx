import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError, humanize, money } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Item = { id: string; nome: string; categoria: string; unidade: string | null; quantidade: number; quantidade_minima: number | null; quantidade_maxima: number | null; ponto_pedido: number | null; valor_unitario: number | null; validade: string | null; localizacao: string | null; lote: string | null; principio_ativo: string | null; dosagem: string | null; codigo_ean: string | null; fabricante: string | null; fornecedor: string | null; descricao: string | null };
type Mov = { id: string; tipo: string; quantidade: number; motivo: string | null; created_at: string };
type Alerta = 'todos' | 'critico' | 'validade' | 'ponto_pedido';
type Move = { item: Item; tipo: 'entrada' | 'saida'; quantidade: string; motivo: string; key: string };

const LIMIT = 1000;
const alertas: { value: Alerta; label: string }[] = [{ value: 'todos', label: 'Todos' }, { value: 'critico', label: 'Estoque crítico' }, { value: 'validade', label: 'Validade' }, { value: 'ponto_pedido', label: 'Ponto de pedido' }];
const normalize = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('pt-BR');
const isCritical = (p: Item) => p.quantidade <= (p.quantidade_minima || 0);
const atReorder = (p: Item) => !!p.ponto_pedido && p.quantidade <= p.ponto_pedido;
// Idempotency key for registrar_movimentacao_estoque (uuid); Hermes has no crypto.randomUUID by default.
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });

function status(p: Item): { label: string; tone: Tone } {
  if (p.quantidade <= 0) return { label: 'Sem estoque', tone: 'danger' };
  if (isCritical(p)) return { label: 'Crítico', tone: 'danger' };
  if (atReorder(p)) return { label: 'Pedir', tone: 'warning' };
  if (p.quantidade <= (p.quantidade_minima || 0) * 1.5) return { label: 'Baixo', tone: 'warning' };
  return { label: 'OK', tone: 'success' };
}

export default function StockScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const { alerta } = useLocalSearchParams<{ alerta?: string }>();
  const [filter, setFilter] = useState<Alerta>(alerta === 'critico' ? 'critico' : 'todos');
  const [search, setSearch] = useState('');
  const [move, setMove] = useState<Move | null>(null);
  const [history, setHistory] = useState<{ item: Item; rows?: Mov[]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  useEffect(() => { setFilter(alerta === 'critico' ? 'critico' : 'todos'); }, [alerta]);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    return (must(await client.from('estoque').select('id, nome, categoria, unidade, quantidade, quantidade_minima, quantidade_maxima, ponto_pedido, valor_unitario, validade, localizacao, lote, principio_ativo, dosagem, codigo_ean, fabricante, fornecedor, descricao').eq('clinica_id', clinicId).order('nome').order('id').limit(LIMIT)) ?? []) as Item[];
  }, [clinicId]);

  const items = data ?? [];
  const hoje = Date.parse(`${clinicDate()}T00:00:00Z`);
  const days = (v: string | null) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? Math.floor((Date.parse(`${v}T00:00:00Z`) - hoje) / 86400000) : null;
  const expiring = (p: Item) => { const d = days(p.validade); return Number(p.quantidade) > 0 && d !== null && d <= 60; };
  const stats = { critico: items.filter(isCritical).length, vencendo: items.filter(p => { const d = days(p.validade); return expiring(p) && d !== null && d >= 0; }).length, pedido: items.filter(atReorder).length, valor: items.reduce((acc, p) => acc + p.quantidade * (p.valor_unitario || 0), 0) };
  const q = normalize(search);
  const filtered = items.filter(p => (!q || [p.nome, p.codigo_ean, p.principio_ativo, p.fabricante, p.lote, p.fornecedor, p.localizacao, p.descricao, p.dosagem, p.categoria].some(v => normalize(v).includes(q)))
    && (filter === 'critico' ? isCritical(p) : filter === 'validade' ? expiring(p) : filter === 'ponto_pedido' ? atReorder(p) : true));

  async function openHistory(item: Item) {
    setHistory({ item });
    try {
      const rows = must(await db.from('movimentacoes_estoque').select('id, tipo, quantidade, motivo, created_at').eq('clinica_id', clinicId).eq('item_id', item.id).order('created_at', { ascending: false }).limit(50)) as Mov[];
      setHistory({ item, rows: rows ?? [] });
    } catch (err) { setHistory({ item, error: friendlyError(err, 'Não foi possível carregar o histórico.') }); }
  }

  async function saveMove() {
    if (!move || busy) return;
    const qty = Number(move.quantidade);
    if (!/^\d+$/.test(move.quantidade.trim()) || !Number.isSafeInteger(qty) || qty <= 0 || qty > 2_147_483_647) return setFeedback({ message: 'Quantidade inválida.', error: true });
    if (!move.motivo.trim()) return setFeedback({ message: 'Informe o motivo da movimentação para manter o histórico do estoque completo.', error: true });
    setBusy(true);
    setFeedback(null);
    try {
      // Same atomic, idempotent RPC as the web; the key is kept across retries of this form.
      const saldo = must(await db.rpc('registrar_movimentacao_estoque', { p_item_id: move.item.id, p_tipo: move.tipo, p_quantidade: qty, p_motivo: move.motivo.trim(), p_chave_idempotencia: move.key }));
      if (!Number.isInteger(saldo)) throw new Error('O servidor não confirmou o novo saldo. Atualize o estoque antes de repetir.');
      setFeedback({ message: `${move.tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada! Novo saldo: ${saldo} ${move.item.unidade || 'unidade'}.` });
      setMove(null);
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao registrar.'), error: true }); } finally { setBusy(false); }
  }

  const subtitle = items.length ? [`${items.length} ${items.length === 1 ? 'item' : 'itens'}`, stats.critico ? `${stats.critico} em estoque baixo` : null, stats.vencendo ? `${stats.vencendo} vencendo em 60 dias` : null].filter(Boolean).join(' · ') : 'Controle de materiais e medicamentos: saldo, validade e movimentações.';

  if (move) {
    const saldo = Number(move.item.quantidade);
    const qty = Number(move.quantidade) || 0;
    const after = move.tipo === 'entrada' ? saldo + qty : saldo - qty;
    return <ModuleScreen moduleKey="estoque" subtitle={move.item.nome}>
      <Card>
        <Text style={styles.title}>{move.tipo === 'entrada' ? 'Registrar entrada' : 'Registrar saída'}</Text>
        <Text style={styles.muted}>Saldo atual: {saldo} {move.item.unidade || 'unidade'}{qty > 0 ? ` · após: ${after}` : ''}</Text>
        <Field label="Quantidade" value={move.quantidade} onChangeText={quantidade => setMove({ ...move, quantidade })} keyboardType="number-pad" placeholder="0"
          error={move.tipo === 'saida' && qty > saldo ? 'A saída é maior que o saldo atual.' : move.tipo === 'entrada' && move.item.quantidade_maxima != null && after > move.item.quantidade_maxima ? `O saldo passará do estoque máximo (${move.item.quantidade_maxima}).` : undefined} />
        <Field label="Motivo" value={move.motivo} onChangeText={motivo => setMove({ ...move, motivo })} placeholder="Ex.: compra, uso em procedimento, perda" multiline />
        {feedback?.error ? <Feedback message={feedback.message} error /> : null}
        <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => { setMove(null); setFeedback(null); }} /><Button label="Confirmar" icon="checkmark" loading={busy} onPress={() => void saveMove()} /></View>
      </Card>
    </ModuleScreen>;
  }

  if (history) return <ModuleScreen moduleKey="estoque" title="Histórico de movimentações" subtitle={history.item.nome}>
    <Button variant="ghost" icon="arrow-back" label="Voltar ao estoque" onPress={() => setHistory(null)} />
    {history.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o histórico" message={history.error} onAction={() => void openHistory(history.item)} />
      : !history.rows ? <StateView loading title="Carregando histórico…" />
      : !history.rows.length ? <StateView icon="time-outline" title="Nenhuma movimentação registrada" />
      : <Section title="Até as 50 movimentações mais recentes">{history.rows.map(m => <ListRow key={m.id} icon={m.tipo === 'entrada' ? 'arrow-down' : 'arrow-up'} tone={m.tipo === 'entrada' ? 'success' : 'neutral'}
        title={`${m.tipo === 'entrada' ? '+' : '-'}${m.quantidade} ${history.item.unidade || 'unidade'}`} subtitle={m.motivo} meta={`${m.tipo === 'entrada' ? 'Entrada' : 'Saída'} · ${dateLabel(m.created_at)}`} />)}</Section>}
  </ModuleScreen>;

  return <ModuleScreen moduleKey="estoque" subtitle={subtitle} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando estoque…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o estoque" message={error} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Estoque baixo" value={stats.critico} tone="danger" onPress={() => setFilter(filter === 'critico' ? 'todos' : 'critico')} />
        <Stat label="Vencendo até 60 dias" value={stats.vencendo} tone="warning" onPress={() => setFilter(filter === 'validade' ? 'todos' : 'validade')} />
        <Stat label="Ponto de pedido" value={stats.pedido} onPress={() => setFilter(filter === 'ponto_pedido' ? 'todos' : 'ponto_pedido')} />
        <Stat label="Valor em estoque" value={money(stats.valor)} tone="success" />
      </View>
      {items.length >= LIMIT ? <Feedback error message={`A tela carregou o limite de ${LIMIT.toLocaleString('pt-BR')} itens. Use a busca ou abra no navegador para ver todo o estoque.`} /> : null}
      <Field label="Buscar produtos" value={search} onChangeText={setSearch} placeholder="Produto, EAN, lote, fornecedor..." autoCorrect={false} />
      <Chips label="Filtrar por alerta" options={alertas} value={filter} onChange={setFilter} />
      {!items.length ? <StateView icon="cube-outline" title="Nenhum item no estoque" message="Cadastre produtos pelo navegador para controlar saldo e validade." />
        : !filtered.length ? <StateView icon="cube-outline" title="Nenhum produto corresponde aos filtros" message="Limpe a busca ou o indicador para ver todos os itens." actionLabel="Limpar filtros" onAction={() => { setSearch(''); setFilter('todos'); }} />
        : <Section title={`${filtered.length} de ${items.length} ${items.length === 1 ? 'item' : 'itens'}`}>{filtered.map(p => {
          const s = status(p);
          const d = days(p.validade);
          return <View key={p.id}>
            <ListRow title={p.nome} subtitle={[humanize(p.categoria), p.principio_ativo, p.dosagem, p.localizacao].filter(Boolean).join(' · ')}
              meta={[`${p.quantidade} ${p.unidade || 'unidade'}${p.quantidade_minima ? ` · mínimo ${p.quantidade_minima}` : ''}`, p.validade ? `Validade ${dateLabel(p.validade)}${d !== null && d <= 60 ? (d < 0 ? ' (vencido)' : ` (${d}d)`) : ''}` : null].filter(Boolean).join(' · ')}
              right={<Badge label={s.label} tone={s.tone} />} />
            <View style={styles.rowActions}>
              <Button variant="secondary" icon="arrow-down" label="Entrada" onPress={() => { setFeedback(null); setMove({ item: p, tipo: 'entrada', quantidade: '', motivo: '', key: uuid() }); }} />
              <Button variant="secondary" icon="arrow-up" label="Saída" onPress={() => { setFeedback(null); setMove({ item: p, tipo: 'saida', quantidade: '', motivo: '', key: uuid() }); }} />
              <Button variant="ghost" icon="time-outline" label="Histórico" onPress={() => void openHistory(p)} />
            </View>
          </View>;
        })}</Section>}
    </>}
    <Section title="No navegador">
      <Text style={styles.muted}>Cadastro, edição e exclusão de produtos e a Curva ABC usam formulários e gráficos amplos e ficam no navegador.</Text>
      <OpenOnWeb path={`/estoque${filter === 'critico' ? '?alerta=critico' : ''}`} label="Abrir estoque no navegador" />
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({ stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }, rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, title: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 4 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 } });
