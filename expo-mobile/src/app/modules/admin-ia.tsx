import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Feedback, ListRow, Section, StateView, Stat } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type AIConfig = { ativo: boolean; modelo_principal: string; modelo_fallback: string | null; temperatura: number; max_tokens: number; limite_mensal_clinica: number; prompt_base: string; versao: number; updated_at: string };
type Usage = { period_start: string; requests: number; failed_requests: number; input_tokens: number; output_tokens: number; total_tokens: number; estimated_cost: number };
type Version = { id: string; versao: number; prompt: string; modelo: string; created_at: string };

const n = (v: number | null | undefined) => Number(v || 0).toLocaleString('pt-BR');

export default function AdminAiScreen() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [config, usage, versions] = await Promise.all([
      client.from('platform_ai_config').select('*').eq('id', true).single(),
      client.rpc('platform_ai_usage_summary'),
      client.from('platform_ai_prompt_versions').select('id,versao,prompt,modelo,criado_por,created_at').order('versao', { ascending: false }).limit(10),
    ]);
    return { config: must<AIConfig>(config), usage: must<Usage>(usage), versions: (must(versions) ?? []) as Version[] };
  }, []);
  const config = data?.config;
  const usage = data?.usage;

  // Toggling republishes the current values through the same versioned RPC as the web, guarded by the expected version.
  function toggle(c: AIConfig) {
    const next = !c.ativo;
    Alert.alert(next ? 'Habilitar o assistente de IA?' : 'Desativar o assistente de IA?', `${next ? 'As clínicas voltarão a poder usar o assistente clínico.' : 'Desativar bloqueia novas chamadas do assistente clínico em todas as clínicas.'} Isso publica a versão ${c.versao + 1} com os demais campos inalterados e fica registrado na auditoria.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: next ? 'Habilitar' : 'Desativar', style: next ? 'default' : 'destructive', onPress: () => void (async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setFeedback(null);
        try {
          const saved = must<AIConfig | null>(await db.rpc('platform_publish_ai_config', { p_expected_version: c.versao, p_ativo: next, p_modelo_principal: c.modelo_principal, p_modelo_fallback: c.modelo_fallback || null, p_temperatura: Number(c.temperatura), p_max_tokens: c.max_tokens, p_limite_mensal_clinica: c.limite_mensal_clinica, p_prompt_base: c.prompt_base }));
          if (!saved) throw new Error('O servidor não retornou a configuração publicada.');
          setFeedback({ message: `Configuração publicada como versão ${saved.versao}.` });
        } catch (err) {
          const msg = (err as Error)?.message ?? '';
          setFeedback({ message: /mudou desde que a página foi aberta/i.test(msg) ? 'Outra pessoa publicou uma versão enquanto você editava. Os dados foram atualizados; confira antes de tentar novamente.' : friendlyError(err), error: true });
        } finally { lock.current = false; setBusy(false); reload(); }
      })() },
    ]);
  }

  return <ModuleScreen moduleKey="admin-ia" title="Governança da IA" subtitle={config ? `Versão ${config.versao} · ${config.ativo ? 'assistente habilitado' : 'assistente desativado'} · ${config.modelo_principal}` : 'Modelos, limites, prompts versionados e consumo agregado da plataforma.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando configuração de IA…" /> : error || !config || !usage ? <StateView icon="alert-circle-outline" title="Não foi possível carregar a configuração de IA." message={error ?? undefined} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Requisições no mês" value={n(usage.requests)} />
        <Stat label={`Tokens no mês (${n(usage.input_tokens)} entrada · ${n(usage.output_tokens)} saída)`} value={n(usage.total_tokens)} tone="info" />
        <Stat label={usage.requests ? `Falhas no mês · ${((usage.failed_requests / usage.requests) * 100).toFixed(1)}% das requisições` : 'Falhas no mês · sem requisições no mês'} value={n(usage.failed_requests)} tone={usage.failed_requests ? 'danger' : 'success'} />
        <Stat label="Custo estimado registrado" value={`US$ ${Number(usage.estimated_cost || 0).toFixed(4)}`} tone="warning" />
      </View>
      {usage.period_start ? <Text style={styles.note}>Período UTC desde {dateLabel(usage.period_start)}. O custo é uma estimativa registrada pelo aplicativo, não uma fatura do provedor.</Text> : null}
      <Section title={`Configuração ativa · versão ${config.versao}`}>
        <Card style={styles.card}>
          <View style={styles.head}><Text style={styles.title}>Assistente de IA</Text><Badge label={config.ativo ? 'Habilitado' : 'Desativado'} tone={config.ativo ? 'success' : 'danger'} /></View>
          <Text style={styles.note}>Modelo principal: {config.modelo_principal}{config.modelo_fallback ? ` · alternativo: ${config.modelo_fallback}` : ''}</Text>
          <Text style={styles.note}>Temperatura {config.temperatura} · máximo de {n(config.max_tokens)} tokens por resposta · cota padrão mensal por clínica: {n(config.limite_mensal_clinica)}</Text>
          <Text style={styles.note}>Atualizada em {dateLabel(config.updated_at)}</Text>
          <Button variant={config.ativo ? 'danger' : 'primary'} label={config.ativo ? 'Desativar assistente' : 'Habilitar assistente'} loading={busy} onPress={() => toggle(config)} />
          <Text style={styles.note}>Modelos, limites e o prompt base de segurança são editados no navegador, onde o rascunho e o conflito de versões são revisados com calma.</Text>
          <OpenOnWeb path="/admin/ia" label="Editar configuração no navegador" />
        </Card>
      </Section>
      <Section title="Versões recentes do prompt">
        <Text style={styles.note}>Histórico somente de leitura. Versões publicadas não podem ser alteradas ou removidas.</Text>
        {!data.versions.length ? <StateView icon="time-outline" title="Ainda não há versões publicadas no histórico." /> : data.versions.map(v => <View key={v.id}>
          <ListRow title={`Versão ${v.versao} · ${v.modelo}`} meta={`Publicada em ${dateLabel(v.created_at)}`} onPress={() => setOpen(open === v.id ? null : v.id)} accessibilityLabel={`${open === v.id ? 'Ocultar' : 'Ver'} prompt da versão ${v.versao}`}
            right={v.versao === config.versao ? <Badge label="Em uso" tone="primary" /> : null} />
          {open === v.id ? <Text selectable style={styles.prompt}>{v.prompt}</Text> : null}
        </View>)}
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({ stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }, note: { color: colors.muted, fontSize: 11, lineHeight: 16, marginVertical: 4 }, card: { gap: 6 }, head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: colors.ink, fontSize: 15, fontWeight: '700' }, prompt: { color: colors.ink, fontSize: 12, lineHeight: 18, backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, marginVertical: 8 } });
