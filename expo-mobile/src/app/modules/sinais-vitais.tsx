import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Field, ListRow, Section, Segmented, StateView } from '../../components/ui';
import { dateLabel } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors, radius } from '../../theme/tokens';

type Patient = { id: string; nome: string; nome_social: string | null };
type VitalKey = 'pressao_sistolica' | 'pressao_diastolica' | 'frequencia_cardiaca' | 'frequencia_respiratoria' | 'temperatura' | 'peso' | 'altura' | 'imc' | 'oxigenacao' | 'glicemia' | 'dor_escala';
type Vital = Record<VitalKey, number | null> & { id: string; created_at: string };
type Triagem = { id: string; agendamento_id: string | null; pressao_arterial: string | null; data_hora: string | null; created_at: string } & Record<string, unknown>;
type Prontuario = { id: string; agendamento_id: string | null; data: string; created_at: string; sinais_vitais: unknown };
type Period = '7' | '30' | '90' | 'tudo';

const MAX = 1000;
const keys: VitalKey[] = ['pressao_sistolica', 'pressao_diastolica', 'frequencia_cardiaca', 'frequencia_respiratoria', 'temperatura', 'peso', 'altura', 'imc', 'oxigenacao', 'glicemia', 'dor_escala'];
// Same keys mapping as src/lib/vitalsHistory.ts (prontuarios.sinais_vitais JSON → VitalKey).
const recordMap: [string, VitalKey][] = [['pressao_sistolica', 'pressao_sistolica'], ['pressao_diastolica', 'pressao_diastolica'], ['frequencia_cardiaca', 'frequencia_cardiaca'], ['frequencia_respiratoria', 'frequencia_respiratoria'], ['temperatura', 'temperatura'], ['peso', 'peso'], ['altura', 'altura'], ['imc', 'imc'], ['saturacao', 'oxigenacao'], ['oxigenacao', 'oxigenacao'], ['glicemia', 'glicemia'], ['dor', 'dor_escala'], ['dor_escala', 'dor_escala']];
const triageMap: [string, VitalKey][] = [['frequencia_cardiaca', 'frequencia_cardiaca'], ['frequencia_respiratoria', 'frequencia_respiratoria'], ['temperatura', 'temperatura'], ['peso', 'peso'], ['altura', 'altura'], ['imc', 'imc'], ['saturacao', 'oxigenacao'], ['glicemia', 'glicemia'], ['dor_escala', 'dor_escala']];

const num = (v: unknown) => typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'string' && v.trim() && Number.isFinite(Number(v.trim().replace(',', '.'))) ? Number(v.trim().replace(',', '.')) : null;
const blank = () => Object.fromEntries(keys.map(k => [k, null])) as Record<VitalKey, number | null>;

/** Port of consolidarHistoricoVitais: triage rows, merged with the latest record of the same appointment. */
function consolidate(triagens: Triagem[], records: Prontuario[]): Vital[] {
  const latestByAppt = new Map<string, Prontuario>();
  for (const r of records) if (r.agendamento_id) { const cur = latestByAppt.get(r.agendamento_id); if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) latestByAppt.set(r.agendamento_id, r); }
  const out = new Map<string, Vital>();
  for (const t of triagens) {
    const v = blank();
    const [s, d] = typeof t.pressao_arterial === 'string' ? t.pressao_arterial.split('/').map(num) : [null, null];
    v.pressao_sistolica = s ?? null; v.pressao_diastolica = d ?? null;
    for (const [from, to] of triageMap) v[to] = num(t[from]);
    out.set(`triagem:${t.id}`, { ...v, id: t.id, created_at: t.data_hora || t.created_at });
  }
  for (const r of records) {
    const triage = r.agendamento_id && latestByAppt.get(r.agendamento_id)?.id === r.id ? triagens.find(t => t.agendamento_id === r.agendamento_id) : undefined;
    const existing = triage ? out.get(`triagem:${triage.id}`) : undefined;
    const src = r.sinais_vitais && typeof r.sinais_vitais === 'object' && !Array.isArray(r.sinais_vitais) ? r.sinais_vitais as Record<string, unknown> : {};
    const fresh = blank();
    for (const [from, to] of recordMap) fresh[to] = fresh[to] ?? num(src[from]);
    if (!existing && !keys.some(k => fresh[k] !== null)) continue;
    const merged = Object.fromEntries(keys.map(k => [k, fresh[k] ?? existing?.[k] ?? null])) as Record<VitalKey, number | null>;
    if (existing && triage) out.delete(`triagem:${triage.id}`);
    // Without a linked triage the record only has a clinical date: place it at local noon.
    const noon = /^\d{4}-\d{2}-\d{2}$/.test(r.data) ? `${r.data}T12:00:00-03:00` : r.created_at;
    out.set(`prontuario:${r.id}`, { ...merged, id: r.id, created_at: existing?.created_at ?? noon });
  }
  return [...out.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

// Alert limits copied from the web (ClinicalSafetyPanel); other signs stay neutral.
function outOfRange(k: VitalKey, v: number | null) {
  if (v === null) return false;
  if (k === 'pressao_sistolica') return v >= 180 || v < 90;
  if (k === 'pressao_diastolica') return v >= 120 || v < 60;
  if (k === 'frequencia_cardiaca') return v > 120 || v < 50;
  if (k === 'temperatura') return v >= 38 || v < 35;
  if (k === 'oxigenacao') return v < 94;
  return false;
}

const charts: { title: string; key: VitalKey; unit: string; digits?: number }[] = [
  { title: 'Pressão sistólica', key: 'pressao_sistolica', unit: 'mmHg' }, { title: 'Frequência cardíaca', key: 'frequencia_cardiaca', unit: 'bpm' },
  { title: 'Evolução de peso', key: 'peso', unit: 'kg', digits: 1 }, { title: 'Saturação O₂', key: 'oxigenacao', unit: '%' }, { title: 'Glicemia', key: 'glicemia', unit: 'mg/dL' },
];

export default function VitalsScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const canReadRecords = Boolean(profile?.roles.some(r => r === 'admin' || r === 'medico'));
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [period, setPeriod] = useState<Period>('tudo');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const results = useLoad(async client => {
    if (!clinicId || patient || term.length < 2) return undefined;
    return (must(await client.rpc('buscar_pacientes_paginado', { p_termo: term, p_limite: 20, p_offset: 0, p_status: 'ativos', p_sexo: null, p_convenio_id: null, p_somente_particular: false, p_nascimento_apos: null, p_nascimento_ate: null }).select('id,nome,nome_social')) ?? []) as Patient[];
  }, [clinicId, term, patient]);

  const history = useLoad(async client => {
    if (!clinicId || !patient) return undefined;
    const triage = await client.from('triagens').select('id, paciente_id, agendamento_id, pressao_arterial, frequencia_cardiaca, frequencia_respiratoria, temperatura, peso, altura, imc, saturacao, glicemia, dor_escala, data_hora, created_at', { count: 'exact' })
      .eq('paciente_id', patient.id).eq('clinica_id', clinicId).order('created_at', { ascending: false }).limit(MAX);
    const triagens = (must(triage) ?? []) as Triagem[];
    let records: Prontuario[] = [];
    let recordsCount = 0;
    if (canReadRecords) {
      // Same as the web: records are read only after the audited authorization succeeds; nursing sees triage only (RLS).
      must(await client.rpc('registrar_visualizacao_historico_paciente', { p_paciente_id: patient.id }));
      const res = await client.from('prontuarios').select('id, paciente_id, agendamento_id, data, created_at, sinais_vitais', { count: 'exact' })
        .eq('paciente_id', patient.id).eq('clinica_id', clinicId).order('created_at', { ascending: false }).limit(MAX);
      records = (must(res) ?? []) as Prontuario[];
      recordsCount = res.count ?? records.length;
    }
    const all = consolidate(triagens, records);
    return { rows: all.slice(-MAX), limited: all.length > MAX || (triage.count ?? triagens.length) > MAX || recordsCount > MAX };
  }, [clinicId, patient?.id, canReadRecords]);

  const allRows = useMemo(() => history.data?.rows ?? [], [history.data]);
  const rows = period === 'tudo' ? allRows : allRows.filter(v => Date.now() - Date.parse(v.created_at) <= Number(period) * 86_400_000);
  const last = (k: VitalKey) => { for (let i = allRows.length - 1; i >= 0; i--) if (allRows[i][k] !== null) return { v: allRows[i][k] as number, at: allRows[i].created_at }; return null; };
  const sis = last('pressao_sistolica'); const dia = last('pressao_diastolica');
  const tiles = [
    { label: 'Pressão arterial', unit: 'mmHg', text: sis && dia ? `${sis.v}/${dia.v}` : '—', at: sis?.at ?? dia?.at, alert: outOfRange('pressao_sistolica', sis?.v ?? null) || outOfRange('pressao_diastolica', dia?.v ?? null) },
    ...([['Freq. cardíaca', 'frequencia_cardiaca', 'bpm', 0], ['Temperatura', 'temperatura', '°C', 1], ['Saturação O₂', 'oxigenacao', '%', 0], ['Peso', 'peso', 'kg', 1], ['IMC', 'imc', 'kg/m²', 1]] as const).map(([label, k, unit, digits]) => {
      const x = last(k);
      return { label, unit, text: x ? (digits ? x.v.toFixed(digits) : String(x.v)) : '—', at: x?.at, alert: outOfRange(k, x?.v ?? null) };
    }),
  ];
  const altered = tiles.filter(t => t.alert).length;
  const name = patient ? patient.nome_social || patient.nome : null;

  return <ModuleScreen moduleKey="sinais-vitais" subtitle={!patient ? 'Acompanhe a evolução clínica com medições da triagem e do prontuário.' : `${name} · ${allRows.length} medição(ões)${altered ? ` · ${altered} sinal(is) alterado(s)` : ''}`}
    refreshing={history.refreshing} onRefresh={patient ? history.refresh : results.refresh}>
    {!patient ? <>
      <Field label="Selecionar paciente" value={search} onChangeText={setSearch} placeholder="Buscar paciente por nome, CPF ou telefone..." autoCorrect={false} returnKeyType="search" hint="Digite ao menos 2 caracteres" />
      {term.length < 2 ? <StateView icon="water-outline" title="Selecione um paciente para visualizar o histórico" message="As medições ficam organizadas por data e atendimento." />
        : results.loading ? <StateView loading title="Buscando pacientes…" />
        : results.error ? <StateView icon="alert-circle-outline" title="Não foi possível concluir a busca" message={results.error} onAction={results.reload} />
        : !results.data?.length ? <StateView icon="search-outline" title="Nenhum paciente encontrado" message="Tente outro nome ou confira a grafia da busca." />
        : results.data.map(p => <ListRow key={p.id} icon="person-outline" title={p.nome_social || p.nome} subtitle={p.nome_social ? p.nome : null} onPress={() => { setPatient(p); setPeriod('tudo'); }} />)}
    </> : <>
      <Card style={styles.patient}>
        <Text style={styles.patientName}>{name}</Text>
        <View style={styles.actions}>
          <Button variant="ghost" icon="close" label="Limpar" onPress={() => { setPatient(null); setSearch(''); }} />
          {canReadRecords ? <Button variant="secondary" icon="document-text-outline" label="Prontuário" onPress={() => router.push({ pathname: '/patients/[patientId]/records', params: { patientId: patient.id } })} /> : null}
        </View>
      </Card>
      {history.loading ? <StateView loading title="Carregando o histórico clínico…" />
        : history.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os sinais vitais" message={history.error} onAction={history.reload} />
        : !allRows.length ? <StateView icon="alert-circle-outline" title="Nenhuma medição encontrada" message="Quando houver sinais vitais na triagem ou no prontuário, eles aparecerão aqui." />
        : <>
          {history.data?.limited ? <Text style={styles.warn}>O histórico excede o limite de visualização de {MAX} medições; parte das medições mais antigas pode não aparecer.</Text> : null}
          <Section title="Últimos valores">
            <View style={styles.tiles}>{tiles.map(t => <View key={t.label} accessible accessibilityLabel={`${t.label}: ${t.text} ${t.unit}${t.alert ? ', alterado' : ''}`} style={[styles.tile, t.alert && styles.tileAlert]}>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={[styles.tileValue, t.alert && { color: colors.danger }]}>{t.text} <Text style={styles.tileUnit}>{t.unit}</Text></Text>
              <Text style={styles.tileAt}>{t.at ? `em ${dateLabel(t.at)}` : 'sem registro'}</Text>
              {t.alert ? <Badge label="Alterado" tone="danger" /> : null}
            </View>)}</View>
          </Section>
          <Section title="Período"><Segmented options={[{ value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }, { value: 'tudo', label: 'Tudo' }]} value={period} onChange={setPeriod} /></Section>
          {!rows.length ? <StateView icon="calendar-outline" title="Nenhuma medição no período selecionado" message="Amplie o período para ver as medições anteriores." actionLabel="Limpar filtros" onAction={() => setPeriod('tudo')} /> : <>
            {charts.map(c => <Bars key={c.key} title={c.title} unit={c.unit} digits={c.digits} points={rows.filter(v => v[c.key] !== null).map(v => ({ at: v.created_at, value: v[c.key] as number, alert: outOfRange(c.key, v[c.key]) }))} />)}
            <Section title={`Últimos registros (${Math.min(10, rows.length)})`}>{rows.slice(-10).reverse().map((v, i) => <ListRow key={v.id} title={dateLabel(v.created_at)}
              subtitle={[v.pressao_sistolica !== null && v.pressao_diastolica !== null ? `PA ${v.pressao_sistolica}/${v.pressao_diastolica}` : null, v.frequencia_cardiaca !== null ? `FC ${v.frequencia_cardiaca}` : null, v.frequencia_respiratoria !== null ? `FR ${v.frequencia_respiratoria}` : null, v.temperatura !== null ? `Temp ${v.temperatura.toFixed(1)}` : null, v.peso !== null ? `Peso ${v.peso.toFixed(1)}` : null, v.imc !== null ? `IMC ${v.imc.toFixed(1)}` : null, v.oxigenacao !== null ? `O2 ${v.oxigenacao}%` : null, v.glicemia !== null ? `Glicemia ${v.glicemia}` : null, v.dor_escala !== null ? `Dor ${v.dor_escala}/10` : null].filter(Boolean).join(' · ') || 'Sem valores'}
              right={keys.some(k => outOfRange(k, v[k])) ? <Badge label="Fora da faixa" tone="danger" /> : i === 0 ? <Badge label="Mais recente" tone="primary" /> : undefined} />)}</Section>
          </>}
        </>}
    </>}
  </ModuleScreen>;
}

/** Horizontal bars (latest 12 points) built with Views; no chart library. */
function Bars({ title, unit, digits = 0, points }: { title: string; unit: string; digits?: number; points: { at: string; value: number; alert: boolean }[] }) {
  if (!points.length) return null;
  const values = points.map(p => p.value);
  const max = Math.max(...values) || 1;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return <Section title={title}>
    <Text style={styles.stats}>Média {avg.toFixed(digits)} · mín {Math.min(...values).toFixed(digits)} · máx {max.toFixed(digits)} {unit}</Text>
    {points.slice(-12).map((p, i) => <View key={`${p.at}-${i}`} accessible accessibilityLabel={`${dateLabel(p.at)}: ${p.value} ${unit}`} style={styles.barRow}>
      <Text style={styles.barDate}>{dateLabel(p.at).slice(0, 10)}</Text>
      <View style={styles.track}><View style={[styles.bar, { width: `${Math.max(4, (p.value / max) * 100)}%`, backgroundColor: p.alert ? colors.danger : colors.primary }]} /></View>
      <Text style={[styles.barValue, p.alert && { color: colors.danger }]}>{p.value.toFixed(digits)}</Text>
    </View>)}
  </Section>;
}

const styles = StyleSheet.create({
  patient: { marginTop: 4 }, patientName: { color: colors.ink, fontSize: 15, fontWeight: '800' }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: 12, padding: 12, fontSize: 12, marginTop: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tile: { flexGrow: 1, flexBasis: '45%', minHeight: 96, padding: 12, gap: 3, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, tileAlert: { borderColor: colors.danger },
  tileLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' }, tileValue: { color: colors.ink, fontSize: 22, fontWeight: '800' }, tileUnit: { color: colors.muted, fontSize: 11, fontWeight: '400' }, tileAt: { color: colors.muted, fontSize: 10 },
  stats: { color: colors.muted, fontSize: 11, marginBottom: 8 }, barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 26 }, barDate: { width: 74, color: colors.muted, fontSize: 10 },
  track: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }, bar: { height: 10, borderRadius: radius.pill }, barValue: { width: 48, textAlign: 'right', color: colors.ink, fontSize: 11, fontWeight: '700' },
});
