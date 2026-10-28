import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Segmented, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Mirrors src/pages/Laboratorio.tsx (worklist) and src/lib/laboratorioWorkflow.ts.
type Coleta = { id: string; codigo_amostra: string | null; status: string; urgente: boolean | null; tipo_amostra: string | null; tubo: string | null; jejum_necessario: boolean | null; jejum_horas: number | null; created_at: string | null; paciente_id: string; pacientes: { nome: string | null; cpf: string | null } | null; medicos: { nome: string | null } | null; laboratorio_setores: { nome: string | null } | null };
type Resultado = { id: string; parametro: string; resultado: string | null; unidade: string | null; valor_referencia_min: number | null; valor_referencia_max: number | null; valor_referencia_texto: string | null; metodo: string | null; critico: boolean | null };

const TETO = 500;
const statusLabels: Record<string, string> = { pendente: 'Pendente', coletado: 'Coletado', em_analise: 'Em Análise', validado: 'Validado', liberado: 'Liberado', cancelado: 'Cancelado', recoleta: 'Recoleta', rejeitada: 'Rejeitada' };
const statusTone: Record<string, Tone> = { pendente: 'warning', recoleta: 'warning', coletado: 'primary', em_analise: 'info', validado: 'success', liberado: 'success', cancelado: 'danger', rejeitada: 'danger' };
const PIPELINE = ['pendente', 'coletado', 'em_analise', 'validado', 'liberado'];
const allowedNext: Record<string, string[]> = { pendente: ['coletado', 'cancelado'], recoleta: ['coletado', 'cancelado'], coletado: ['em_analise'], em_analise: ['validado'] };
// Release goes through Laudos, never through the pipeline shortcut (same as the web).
const nextStatus = (s: string) => s === 'validado' ? null : (i => i >= 0 && i < PIPELINE.length - 1 ? PIPELINE[i + 1] : null)(PIPELINE.indexOf(s));
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const parseNum = (v: string) => { const t = v.trim().replace(',', '.'); return !t ? null : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t) ? Number(t) : Number.NaN; };
const sla = (iso: string) => { const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ''}`; };
const emptyResult = { parametro: '', resultado: '', unidade: '', metodo: '', min: '', max: '', texto: '', critico: false };

export default function LaboratorioScreen() {
  const { session, profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const canManage = !!profile?.roles.some(r => r === 'admin' || r === 'enfermagem');
  const [periodo, setPeriodo] = useState<'hoje' | 'ontem' | '7dias' | 'todos'>('hoje');
  const [status, setStatus] = useState('todos');
  const [urgente, setUrgente] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [result, setResult] = useState(emptyResult);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();
  const yesterday = clinicDate(-1);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const rows = must<Coleta[]>(await client.from('coletas_laboratorio').select('id, codigo_amostra, status, urgente, tipo_amostra, tubo, jejum_necessario, jejum_horas, created_at, paciente_id, pacientes(nome, cpf), medicos(nome), laboratorio_setores(nome)')
      .eq('clinica_id', clinicId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(TETO + 1)) ?? [];
    return { coletas: rows.slice(0, TETO), hasMore: rows.length > TETO };
  }, [clinicId]);

  const results = useLoad(async client => {
    if (!clinicId || !openId) return undefined;
    return (must<Resultado[]>(await client.from('resultados_laboratorio').select('id, parametro, resultado, unidade, valor_referencia_min, valor_referencia_max, valor_referencia_texto, metodo, critico').eq('coleta_id', openId).eq('clinica_id', clinicId).order('parametro')) ?? []);
  }, [clinicId, openId]);

  const coletas = data?.coletas ?? [];
  const todays = coletas.filter(c => c.created_at && dayOf(c.created_at) === today);
  const count = (s: string) => todays.filter(c => c.status === s).length;
  const proxima = coletas.find(c => c.status === 'pendente' && c.urgente) ?? coletas.find(c => c.status === 'pendente');
  const q = norm(search.trim());
  const weekAgo = Date.now() - 7 * 86400000;
  const filtered = coletas.filter(c => {
    if (q && !norm(c.codigo_amostra ?? '').includes(q) && !norm(c.pacientes?.nome ?? '').includes(q) && !(q.replace(/\D/g, '') && (c.pacientes?.cpf ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '')))) return false;
    if (status !== 'todos' && c.status !== status) return false;
    if (urgente && !c.urgente) return false;
    const day = c.created_at ? dayOf(c.created_at) : null;
    if (periodo === 'hoje' && day !== today) return false;
    if (periodo === 'ontem' && day !== yesterday) return false;
    if (periodo === '7dias' && c.created_at && new Date(c.created_at).getTime() < weekAgo) return false;
    return true;
  });
  const selected = coletas.find(c => c.id === openId);

  async function advance(c: Coleta, next: string) {
    if (!clinicId || !profile) return;
    setBusy(c.id); setFeedback(null);
    try {
      if (!allowedNext[c.status]?.includes(next)) throw new Error('Esta transição de status não é permitida. Atualize a worklist.');
      if (next === 'validado') must(await db.rpc('validar_coleta_laboratorio', { p_coleta_id: c.id }));
      else {
        const updates: Record<string, unknown> = { status: next };
        if (next === 'coletado') Object.assign(updates, { data_coleta: new Date().toISOString(), coletado_por: session?.user.id ?? null });
        // Status guard: fails when someone moved the sample meanwhile.
        const row = must(await db.from('coletas_laboratorio').update(updates).eq('id', c.id).eq('clinica_id', clinicId).eq('status', c.status).select('id').maybeSingle());
        if (!row) throw new Error('A coleta mudou de status ou não pertence à clínica atual. Atualize a worklist.');
      }
      setFeedback({ message: next === 'validado' ? 'Coleta validada e conferência registrada' : next === 'coletado' ? 'Coleta registrada' : 'Status atualizado' });
    } catch (err) { setFeedback({ message: `Não foi possível mudar o status da coleta. ${friendlyError(err)}`, error: true }); }
    finally { setBusy(null); reload(); }
  }

  function cancel(c: Coleta) {
    Alert.alert('Cancelar coleta?', `A amostra ${c.codigo_amostra ?? ''} de ${c.pacientes?.nome ?? 'paciente'} será marcada como cancelada.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Cancelar coleta', style: 'destructive', onPress: () => void advance(c, 'cancelado') },
    ]);
  }

  async function addResult() {
    if (!clinicId || !selected || busy) return;
    const min = parseNum(result.min); const max = parseNum(result.max);
    if (!result.parametro.trim() || !result.resultado.trim()) return setFeedback({ message: 'Informe o parâmetro e o resultado da análise.', error: true });
    if ([min, max].some(v => v !== null && !Number.isFinite(v))) return setFeedback({ message: 'Os valores de referência precisam ser numéricos.', error: true });
    if (min !== null && max !== null && min > max) return setFeedback({ message: 'O valor de referência mínimo não pode ser maior que o máximo.', error: true });
    setBusy('result'); setFeedback(null);
    try {
      const coleta = must(await db.from('coletas_laboratorio').select('id, paciente_id, status').eq('id', selected.id).eq('clinica_id', clinicId).maybeSingle());
      if (!coleta || !['coletado', 'em_analise'].includes(coleta.status)) throw new Error('Só é possível registrar resultado em uma amostra coletada que ainda esteja em análise.');
      must(await db.from('resultados_laboratorio').insert({ coleta_id: selected.id, paciente_id: coleta.paciente_id, clinica_id: clinicId, parametro: result.parametro.trim(), resultado: result.resultado.trim(), unidade: result.unidade.trim() || null, metodo: result.metodo.trim() || null, valor_referencia_min: min, valor_referencia_max: max, valor_referencia_texto: result.texto.trim() || null, critico: result.critico }));
      setResult(emptyResult);
      setFeedback({ message: 'Resultado adicionado!' });
      results.reload();
    } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); }
  }

  return <ModuleScreen moduleKey="laboratorio" title="Laboratório" refreshing={refreshing} onRefresh={refresh}
    subtitle={todays.length ? `${todays.filter(c => c.status !== 'cancelado').length} amostra(s) hoje · ${count('pendente')} pendente(s) · ${todays.filter(c => c.urgente).length} urgente(s)` : 'Central de gestão laboratorial — worklist, coletas e resultados'}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando worklist…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar a worklist do laboratório" message={`As ações de coleta foram pausadas para evitar atualizar amostras com status desatualizado. ${error}`} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Urgentes" value={todays.filter(c => c.urgente).length} tone="danger" onPress={() => { setPeriodo('hoje'); setStatus('todos'); setUrgente(!urgente); }} />
        {(['pendente', 'em_analise', 'validado', 'liberado'] as const).map(s => <Stat key={s} label={s === 'em_analise' ? 'Em análise' : `${statusLabels[s]}s`} value={count(s)} tone={statusTone[s]} onPress={() => { setPeriodo('hoje'); setUrgente(false); setStatus(s); }} />)}
      </View>
      {proxima ? <Card style={styles.hero}>
        <Text style={styles.kicker}>{proxima.urgente ? 'Urgente — Próxima a coletar' : 'Próxima coleta pendente'}</Text>
        <Text style={styles.heroName}>{proxima.pacientes?.nome ?? 'Paciente'}</Text>
        <Text style={styles.muted}>{[proxima.tipo_amostra, proxima.tubo, proxima.medicos?.nome].filter(Boolean).join(' · ')}</Text>
        <View style={styles.actions}><Button label="Registrar coleta" icon="arrow-forward" loading={busy === proxima.id} disabled={!!busy} onPress={() => void advance(proxima, 'coletado')} /></View>
      </Card> : null}

      <Section title="Worklist">
        <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Paciente, CPF ou código da amostra" autoCapitalize="none" />
        <Segmented options={[{ value: 'hoje', label: 'Hoje' }, { value: 'ontem', label: 'Ontem' }, { value: '7dias', label: '7 dias' }, { value: 'todos', label: 'Todos' }]} value={periodo} onChange={setPeriodo} />
        <Chips label="Status" options={[{ value: 'todos', label: 'Todos' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} value={status} onChange={setStatus} />
        <View style={styles.switchRow}><Text style={styles.label}>Somente urgentes</Text><Switch accessibilityLabel="Somente urgentes" value={urgente} onValueChange={setUrgente} trackColor={{ true: colors.primary, false: colors.border }} /></View>
        {!filtered.length ? <StateView icon="flask-outline" title="Nenhuma amostra neste filtro" message="Ajuste o período, o status ou a busca." /> : filtered.map(c => {
          const next = nextStatus(c.status);
          return <View key={c.id} style={styles.item}>
            <ListRow title={c.pacientes?.nome ?? 'Paciente'} subtitle={[c.codigo_amostra, c.laboratorio_setores?.nome, c.tipo_amostra, c.tubo, c.jejum_necessario ? `Jejum ${c.jejum_horas ?? 0}h` : null].filter(Boolean).join(' · ')}
              meta={[c.urgente ? 'Urgente' : null, c.medicos?.nome, c.created_at && !['liberado', 'cancelado'].includes(c.status) ? `Aguardando ${sla(c.created_at)}` : c.created_at ? dateLabel(c.created_at) : null].filter(Boolean).join(' · ')}
              right={<Badge label={statusLabels[c.status] ?? c.status} tone={statusTone[c.status] ?? 'neutral'} />} />
            <View style={styles.actions}>
              {next && c.status !== 'cancelado' ? <Button variant="secondary" icon="arrow-forward" label={statusLabels[next]} disabled={!!busy} loading={busy === c.id} onPress={() => void advance(c, next)} /> : null}
              {c.status === 'validado' ? <Button variant="secondary" icon="document-text-outline" label="Liberar laudo" onPress={() => router.push('/modules/laudos')} /> : null}
              <Button variant="ghost" icon="eye-outline" label={openId === c.id ? 'Fechar resultados' : 'Resultados'} onPress={() => { setOpenId(openId === c.id ? null : c.id); setResult(emptyResult); }} />
              {c.status === 'pendente' || c.status === 'recoleta' ? <Button variant="danger" label="Cancelar" disabled={!!busy} onPress={() => cancel(c)} /> : null}
            </View>
            {openId === c.id ? <Card>
              <Text style={styles.label}>Resultados laboratoriais</Text>
              {results.loading ? <StateView loading title="Carregando resultados…" /> : results.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os resultados desta amostra" message={results.error} onAction={results.reload} /> : !results.data?.length ? <Text style={styles.muted}>Nenhum resultado cadastrado</Text> : results.data.map(r => {
                const n = Number(String(r.resultado ?? '').trim().includes(',') ? String(r.resultado).replace(/\./g, '').replace(',', '.') : r.resultado);
                const altered = !!r.resultado?.trim() && Number.isFinite(n) && ((r.valor_referencia_min != null && n < r.valor_referencia_min) || (r.valor_referencia_max != null && n > r.valor_referencia_max));
                return <ListRow key={r.id} title={r.parametro} subtitle={`Ref: ${r.valor_referencia_texto || `${r.valor_referencia_min ?? '-'} a ${r.valor_referencia_max ?? '-'} ${r.unidade ?? ''}`}${r.metodo ? ` · Método: ${r.metodo}` : ''}`}
                  right={<Badge label={`${r.resultado ?? ''} ${r.unidade ?? ''}${r.critico ? ' · Crítico' : ''}`} tone={altered || r.critico ? 'danger' : 'neutral'} />} />;
              })}
              {c.status === 'coletado' || c.status === 'em_analise' ? <View style={styles.form}>
                <Text style={styles.label}>Adicionar resultado</Text>
                <Field label="Parâmetro *" value={result.parametro} onChangeText={parametro => setResult({ ...result, parametro })} placeholder="Ex: Hemoglobina" />
                <Field label="Resultado *" value={result.resultado} onChangeText={resultado => setResult({ ...result, resultado })} placeholder="Ex: 14.2" />
                <Field label="Unidade" value={result.unidade} onChangeText={unidade => setResult({ ...result, unidade })} placeholder="g/dL" />
                <Field label="Método" value={result.metodo} onChangeText={metodo => setResult({ ...result, metodo })} placeholder="Automatizado" />
                <Field label="Ref. Mínimo" value={result.min} onChangeText={min => setResult({ ...result, min })} keyboardType="decimal-pad" placeholder="Opcional" />
                <Field label="Ref. Máximo" value={result.max} onChangeText={max => setResult({ ...result, max })} keyboardType="decimal-pad" placeholder="Opcional" />
                <Field label="Referência textual" value={result.texto} onChangeText={texto => setResult({ ...result, texto })} placeholder="Ex: Não reagente" />
                <View style={styles.switchRow}><Text style={styles.label}>Resultado crítico</Text><Switch accessibilityLabel="Resultado crítico" value={result.critico} onValueChange={critico => setResult({ ...result, critico })} trackColor={{ true: colors.danger, false: colors.border }} /></View>
                <Button label="Adicionar" icon="add" loading={busy === 'result'} disabled={!result.parametro.trim() || !result.resultado.trim()} onPress={() => void addResult()} />
              </View> : <Text style={styles.muted}>A amostra não está mais aberta para lançamento. Isso preserva a conferência e a trilha de auditoria do resultado.</Text>}
            </Card> : null}
          </View>;
        })}
        {data?.hasMore ? <Text style={styles.note}>Mostrando as {TETO} amostras mais recentes. O histórico completo está no navegador.</Text> : null}
      </Section>
    </>}
    <Section title="No navegador">
      <Text style={styles.muted}>Nova coleta (formulário completo com pedido, tubo, convênio e guia), impressão de etiquetas, pedidos, gestão{canManage ? ', limpeza da fila antiga' : ''} e indicadores do laboratório ficam no computador.</Text>
      <View style={styles.actions}><OpenOnWeb path="/laboratorio" label="Abrir laboratório no navegador" /></View>
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }, hero: { marginTop: 12, borderColor: colors.primary },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }, heroName: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 4 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 }, item: { marginBottom: 6 }, form: { marginTop: 14 },
  switchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 12 },
});
