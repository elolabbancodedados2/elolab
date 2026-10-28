import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Feedback, ListRow, Section, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Status view of src/components/configuracoes/IntegracoesClinica.tsx (Edge Function clinic-integrations).
// Credentials are never typed or shown here: connecting/changing them is handed off to the web.
type Integration = { id: string; nome: string; descricao: string; escopo: 'clinica' | 'profissional'; somenteStatus?: boolean };
type Connection = { provedor: string; referencia_id: string | null; status: 'conectado' | 'erro' | 'desconectado'; config: Record<string, string>; ultimo_teste_em: string | null; conectado_em: string };
const STATUS: Record<Connection['status'], [string, Tone]> = { conectado: ['Conectada', 'success'], erro: ['Com erro', 'danger'], desconectado: ['Desconectado', 'neutral'] };
const testHelp: Record<string, string> = {
  not_connected: 'Conecte a conta Mercado Pago e tente novamente.',
  credential_expired: 'A autorização expirou. Reconecte a conta Mercado Pago para renovar o acesso.',
  credential_rejected: 'A autorização pode ter expirado ou sido revogada. Reconecte a conta Mercado Pago.',
  identity_mismatch: 'A conta vinculada não corresponde à conexão salva. Reconecte a conta correta.',
  provider_unavailable: 'O Mercado Pago não respondeu agora. Confira a disponibilidade e tente novamente em instantes.',
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!db) throw new Error('O app ainda não está conectado ao servidor.');
  const { data, error } = await db.functions.invoke('clinic-integrations', { body });
  if (error) {
    let msg = 'Não foi possível concluir agora.';
    try { msg = (await error.context?.json())?.error || msg; } catch { /* non-JSON body */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export default function IntegrationsScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [list, doctors] = await Promise.all([
      call<{ catalogo: Integration[]; conexoes: Connection[] }>({ action: 'list' }),
      client.from('medicos').select('id, nome, ativo').eq('clinica_id', clinicId).eq('ativo', true).order('nome'),
    ]);
    return { ...list, doctors: (must(doctors) ?? []) as { id: string; nome: string }[] };
  }, [clinicId]);

  const connection = (provider: string, ref: string | null) => data?.conexoes.find(c => c.provedor === provider && (c.referencia_id ?? null) === ref);

  async function test(i: Integration) {
    setBusy(i.id);
    setFeedback(null);
    try {
      const result = await call<{ healthy: boolean; code?: string }>({ action: 'test', provedor: i.id });
      setFeedback(result.healthy ? { message: 'Conexão validada. O Mercado Pago respondeu e a conta vinculada confere.' } : { message: testHelp[result.code ?? ''] ?? 'Revise a conexão ou contate o suporte.', error: true });
    } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível testar a conexão.'), error: true }); } finally { setBusy(null); reload(); }
  }

  function disconnect(i: Integration, ref: string | null) {
    const detail = i.id === 'mercado_pago' ? 'O EloLab apagará a autorização salva. Para revogar também o acesso da aplicação, faça isso nas configurações da sua conta Mercado Pago.' : 'A credencial salva será apagada.';
    Alert.alert(`Desconectar ${i.nome}?`, detail, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Desconectar', style: 'destructive', onPress: () => void (async () => {
        setBusy(`${i.id}:${ref}`);
        try { await call({ action: 'disconnect', provedor: i.id, referencia_id: ref }); setFeedback({ message: `${i.nome} desconectado.` }); } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível desconectar.'), error: true }); } finally { setBusy(null); reload(); }
      })() },
    ]);
  }

  function row(i: Integration, ref: string | null, title?: string) {
    const c = connection(i.id, ref);
    const on = c && c.status !== 'desconectado';
    const [label, tone] = c ? STATUS[c.status] : ['Não conectado', 'neutral' as Tone];
    const since = on ? `desde ${dateLabel(c.conectado_em).slice(0, 10)}` : null;
    const subtitle = i.somenteStatus
      ? on ? `Prescritor registrado · ${since}` : 'Ainda sem prescrição feita por este médico'
      : on ? `${i.id === 'mercado_pago' && c.config?.nickname ? `Conta ${c.config.nickname} · ` : ''}${i.id === 'mercado_pago' ? 'conectada' : 'credencial salva'} · ${since}` : 'Opcional · não conectado';
    return <View key={`${i.id}:${ref ?? 'clinica'}`}>
      <ListRow title={title ?? i.nome} subtitle={c?.status === 'erro' ? 'Falha na última comunicação. Revise a conexão ou contate o suporte.' : subtitle}
        meta={on && !i.somenteStatus ? c.ultimo_teste_em ? `${c.status === 'erro' ? 'Última tentativa de sincronização' : 'Última sincronização'}: ${dateLabel(c.ultimo_teste_em)}` : 'Nenhuma sincronização registrada' : null}
        right={<Badge label={i.id === 'mercado_pago' && c?.status === 'conectado' ? 'Conta conectada' : label} tone={tone} />} />
      {on && !i.somenteStatus ? <View style={styles.actions}>
        {i.id === 'mercado_pago' ? <Button variant="secondary" icon="checkmark-circle-outline" label="Testar conexão" loading={busy === i.id} disabled={busy !== null} onPress={() => void test(i)} /> : null}
        <Button variant="ghost" icon="close-circle-outline" label="Desconectar" disabled={busy !== null} onPress={() => disconnect(i, ref)} />
      </View> : null}
    </View>;
  }

  return <ModuleScreen moduleKey="integracoes" subtitle="Serviços que a clínica conecta com a própria conta." refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Card><Text style={styles.text}>As credenciais são guardadas cifradas no servidor e nunca são exibidas de novo. Conectar ou trocar uma credencial é feito na versão web. Conectar o Mercado Pago é opcional; sem a conexão, o financeiro e os resumos internos do EloLab continuam disponíveis.</Text></Card>
    {loading ? <StateView loading title="Carregando integrações…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as integrações" message={error} onAction={reload} /> :
      !data?.catalogo.length ? <StateView icon="extension-puzzle-outline" title="Nenhuma integração disponível ainda" message="Elas aparecem aqui conforme forem liberadas." /> :
        data.catalogo.map(i => <Section key={i.id} title={i.nome}>
          <Text style={styles.text}>{i.descricao}</Text>
          {i.escopo === 'clinica' ? row(i, null) : !data.doctors.length ? <Text style={styles.text}>Cadastre ou ative um profissional para conectar esta integração.</Text> : data.doctors.map(d => row(i, d.id, d.nome))}
        </Section>)}
    <View style={styles.web}><OpenOnWeb path="/configuracoes?tab=integracoes" label="Conectar ou trocar credencial no navegador" /></View>
  </ModuleScreen>;
}

const styles = StyleSheet.create({ text: { color: colors.muted, fontSize: 12, lineHeight: 18 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }, web: { marginTop: 18 } });
