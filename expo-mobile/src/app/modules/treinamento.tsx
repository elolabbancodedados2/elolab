import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { AppRole } from '../../auth/AuthContext';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Feedback, ListRow, Section, StateView } from '../../components/ui';
import { friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { canOpen, catalog, personal, WEB_BASE_URL } from '../../navigation/catalog';
import { colors } from '../../theme/tokens';

type Step = { title: string; description: string; href?: string; action?: string; roles?: AppRole[] };
type Tutorial = { key: string; title: string; description: string; minutes: number; roles: AppRole[]; steps: Step[] };

const everyone: AppRole[] = ['admin', 'medico', 'recepcao', 'enfermagem', 'financeiro'];
// Same scripts as the web page src/pages/Treinamento.tsx (keys are shared with user_training_progress).
const tutorials: Tutorial[] = [
  { key: 'rotina-diaria', title: 'Comece o dia com segurança', description: 'Aprenda a identificar prioridades e pendências sem alterar registros.', minutes: 3, roles: everyone, steps: [
    { title: 'Leia seu painel', description: 'Os atalhos e indicadores são adaptados à sua função. Comece pelas pendências que exigem atenção.', href: '/dashboard', action: 'Abrir dashboard' },
    { title: 'Confira as notificações', description: 'Use filtros e marque como lido somente o que você já conferiu.', href: '/notificacoes', action: 'Ver notificações' },
    { title: 'Organize as tarefas', description: 'Revise responsável, prazo e contexto antes de concluir uma tarefa.', href: '/tarefas', action: 'Abrir tarefas' },
  ] },
  { key: 'agenda-recepcao', title: 'Agenda e chegada do paciente', description: 'Pratique a sequência administrativa correta para um atendimento.', minutes: 4, roles: ['admin', 'recepcao'], steps: [
    { title: 'Pesquise antes de cadastrar', description: 'Procure nome e documento para evitar pacientes duplicados.', href: '/pacientes', action: 'Abrir pacientes' },
    { title: 'Confirme antes de agendar', description: 'Revise paciente, profissional, data e horário antes de salvar.', href: '/agenda', action: 'Abrir agenda' },
    { title: 'Registre a chegada', description: 'Encaminhe para a fila somente quando a presença estiver confirmada.', href: '/recepcao', action: 'Abrir recepção' },
  ] },
  { key: 'fluxo-clinico', title: 'Fluxo clínico responsável', description: 'Revise as etapas de triagem, atendimento e documentação.', minutes: 5, roles: ['admin', 'medico', 'enfermagem'], steps: [
    { title: 'Confirme a pessoa atendida', description: 'Antes de registrar qualquer dado, confira paciente e atendimento selecionados.' },
    { title: 'Finalize sua etapa', description: 'Só avance a fila depois de concluir e revisar as informações da etapa atual.', href: '/fila', action: 'Abrir fila' },
    { title: 'Revise documentos', description: 'Assine ou finalize documentos clínicos somente após a revisão completa.', href: '/documentos-clinicos', action: 'Abrir documentos', roles: ['admin', 'medico'] },
  ] },
  { key: 'financeiro-seguro', title: 'Rotina financeira confiável', description: 'Confira valores e estados antes de registrar movimentações.', minutes: 4, roles: ['admin', 'financeiro'], steps: [
    { title: 'Defina o período', description: 'Confirme datas e filtros para interpretar os totais corretamente.', href: '/financeiro', action: 'Abrir financeiro' },
    { title: 'Revise os dados', description: 'Confira valor, vencimento, favorecido e situação antes de uma baixa.', href: '/contas', action: 'Abrir contas' },
    { title: 'Valide o resultado', description: 'Após salvar, confirme a mensagem de sucesso e o novo estado do registro.' },
  ] },
  { key: 'fluxo-laboratorio', title: 'Pedido, coleta e laudo', description: 'Entenda como acompanhar um exame desde a solicitação até a liberação do resultado.', minutes: 4, roles: ['admin', 'enfermagem'], steps: [
    { title: 'Confira os pedidos', description: 'Revise paciente, exames e prioridade antes de preparar a coleta.', href: '/exames', action: 'Ver solicitações' },
    { title: 'Organize a coleta', description: 'Use o mapa para conferir tubos, status e necessidade de recoleta.', href: '/mapa-coleta', action: 'Abrir mapa de coleta' },
    { title: 'Acompanhe os resultados', description: 'Registre resultados e confira se foram validados e liberados para consulta.', href: '/laudos-lab', action: 'Abrir laudos' },
  ] },
  { key: 'convenios-glosas', title: 'Convênios, lotes e glosas', description: 'Registre o acompanhamento administrativo e saiba o que precisa ser enviado fora do sistema.', minutes: 4, roles: ['admin', 'financeiro'], steps: [
    { title: 'Confira o cadastro do convênio', description: 'Revise registro ANS, versão TISS e tabela de preços antes de abrir um lote.', href: '/convenios', action: 'Abrir convênios' },
    { title: 'Registre e exporte o lote', description: 'O XML disponível é um resumo operacional; valide o arquivo no padrão exigido e transmita pelo canal oficial da operadora.', href: '/faturamento-convenios', action: 'Abrir TISS e glosas' },
    { title: 'Acompanhe a glosa', description: 'Registre código, motivo e valor; prepare e marque o recurso depois de enviá-lo pelo canal da operadora.' },
  ] },
  { key: 'repasses-medicos', title: 'Fechamento de repasses médicos', description: 'Concilie recebimentos e registre corretamente o pagamento ao profissional.', minutes: 3, roles: ['admin', 'financeiro'], steps: [
    { title: 'Confira as regras', description: 'Revise a regra de valor fixo ou percentual de cada médico antes de conciliar.', href: '/repasses-medicos', action: 'Revisar repasses' },
    { title: 'Concilie a competência', description: 'Selecione o mês e confira a base de receitas efetivamente quitadas e o valor calculado.' },
    { title: 'Registre o pagamento', description: 'Faça a transferência fora desta tela. Depois, registre o status no EloLab para manter a conciliação atualizada.' },
  ] },
  { key: 'relatorios', title: 'Relatórios da clínica', description: 'Consulte dados de cada área e reaproveite relatórios personalizados.', minutes: 3, roles: ['admin', 'financeiro'], steps: [
    { title: 'Explore por área', description: 'Use relatórios para consultar atendimento, pacientes, médicos, estoque e financeiro.', href: '/relatorios', action: 'Abrir relatórios' },
    { title: 'Reaproveite um relatório', description: 'Salve filtros úteis e revise destinatários e frequência antes de agendar envios.', href: '/relatorios/salvos', action: 'Ver relatórios salvos' },
  ] },
  { key: 'indicadores-clinica', title: 'Indicadores da clínica', description: 'Compare períodos e acompanhe tendências operacionais e financeiras.', minutes: 3, roles: ['admin'], steps: [
    { title: 'Defina o período', description: 'Escolha uma janela coerente e compare com o período anterior quando precisar avaliar mudanças.', href: '/analytics', action: 'Abrir indicadores' },
    { title: 'Aprofunde no relatório', description: 'Para listas detalhadas e exportações por área, continue em Relatórios.', href: '/relatorios', action: 'Abrir relatórios' },
  ] },
  { key: 'privacidade-conta', title: 'Privacidade e segurança da conta', description: 'Boas práticas para proteger acessos e informações sensíveis.', minutes: 3, roles: everyone, steps: [
    { title: 'Use sua própria conta', description: 'Nunca compartilhe senha ou sessão. Cada ação precisa ter autoria identificável.' },
    { title: 'Confira permissões', description: 'Se uma função não deveria acessar algo, informe o administrador em vez de compartilhar dados.' },
    { title: 'Proteja a sessão', description: 'Bloqueie ou encerre a sessão ao se afastar de um dispositivo compartilhado.', href: '/seguranca', action: 'Revisar segurança' },
  ] },
];

export default function TrainingScreen() {
  const { session, profile, hasFeature } = useAuth();
  const clinicId = profile?.clinicaId;
  const userId = session?.user.id;
  const roles = profile?.roles ?? [];
  const [active, setActive] = useState<{ tutorial: Tutorial; step: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const finishLock = useRef(false);
  const visible = tutorials.filter(t => t.roles.some(r => roles.includes(r))).map(t => ({ ...t, steps: t.steps.filter(s => !s.roles || s.roles.some(r => roles.includes(r))) }));

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId || !userId) return undefined;
    const rows = must<{ tutorial_key: string }[]>(await client.from('user_training_progress').select('tutorial_key').eq('user_id', userId).eq('clinica_id', clinicId));
    return new Set((rows ?? []).map(r => r.tutorial_key));
  }, [clinicId, userId]);
  const done = visible.filter(t => data?.has(t.key)).length;

  // Opens the native screen when the web route has one the account can see; otherwise the web app.
  function openRoute(href: string) {
    const entry = [...catalog.flatMap(g => g.items.map(item => ({ item, group: g }))), ...personal.map(item => ({ item, group: undefined }))].find(e => e.item.web === href);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (entry && canOpen(profile, hasFeature, entry.item, entry.group)) router.push(entry.item.route as any);
    else void Linking.openURL(`${WEB_BASE_URL}${href}`);
  }

  async function finish() {
    if (finishLock.current || !active || !clinicId || !userId) return;
    finishLock.current = true;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      must(await db.from('user_training_progress').upsert({ user_id: userId, clinica_id: clinicId, tutorial_key: active.tutorial.key, completed_at: now, updated_at: now }, { onConflict: 'user_id,clinica_id,tutorial_key' }));
      setActive(null);
      setFeedback({ message: 'Tutorial concluído.' });
      reload();
    } catch (err) {
      setFeedback({ message: `Não foi possível salvar o progresso. O tutorial continua disponível. ${friendlyError(err)}`, error: true });
    } finally { finishLock.current = false; setSaving(false); }
  }

  const current = active ? active.tutorial.steps[active.step] : null;
  return <ModuleScreen moduleKey="treinamento" subtitle={`Roteiros curtos para dominar seu fluxo, sem criar ou alterar dados da clínica.${visible.length && data ? ` ${done} de ${visible.length} concluídos.` : ''}`} refreshing={refreshing} onRefresh={refresh}>
    <Card style={styles.notice}><Text style={styles.noticeTitle}>Treinamento sem dados fictícios</Text><Text style={styles.noticeText}>Os roteiros apenas orientam a navegação. Nenhum paciente, consulta, prontuário ou lançamento financeiro é criado automaticamente.</Text></Card>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {!clinicId ? <StateView icon="business-outline" title="Clínica não identificada" message="Vincule seu usuário a uma clínica para carregar e salvar seu progresso de treinamento." /> : active && current ? <Card style={styles.step}>
      <Badge label={`Etapa ${active.step + 1} de ${active.tutorial.steps.length}`} tone="primary" />
      <Text accessibilityRole="header" style={styles.stepTitle}>{current.title}</Text>
      <Text style={styles.stepText}>{current.description}</Text>
      <Text style={styles.stepOf}>{active.tutorial.title}</Text>
      {current.href ? <Button variant="secondary" icon="arrow-forward" label={current.action ?? 'Abrir'} onPress={() => openRoute(current.href!)} /> : null}
      <View style={styles.actions}>
        <Button variant="ghost" label={active.step === 0 ? 'Fechar' : 'Anterior'} disabled={saving} onPress={() => setActive(active.step === 0 ? null : { ...active, step: active.step - 1 })} />
        {active.step < active.tutorial.steps.length - 1 ? <Button label="Próxima" icon="arrow-forward" onPress={() => setActive({ ...active, step: active.step + 1 })} /> : <Button label={saving ? 'Salvando…' : 'Concluir tutorial'} icon="checkmark" loading={saving} onPress={() => void finish()} />}
      </View>
    </Card> : <>
      {loading ? <StateView loading title="Carregando progresso…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar seu progresso" message="Os roteiros continuam disponíveis; o histórico de conclusão não foi carregado." onAction={reload} /> : <Text style={styles.progress}>{done} de {visible.length} roteiros concluídos · {visible.length ? Math.round((done / visible.length) * 100) : 0}%</Text>}
      {!visible.length ? <StateView icon="book-outline" title="Nenhum roteiro para o seu perfil" /> : <Section title="Tutoriais disponíveis">{visible.map(t => {
        const completed = data?.has(t.key);
        return <ListRow key={t.key} icon={completed ? 'checkmark-circle' : 'book-outline'} tone={completed ? 'success' : 'primary'} title={t.title} subtitle={t.description} meta={`${t.steps.length} etapas · cerca de ${t.minutes} min`}
          right={completed ? <Badge label="Concluído" tone="success" /> : null} accessibilityLabel={`${completed ? 'Repetir' : 'Começar'} tutorial ${t.title}`} onPress={() => { setFeedback(null); setActive({ tutorial: t, step: 0 }); }} />;
      })}</Section>}
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, marginBottom: 6 }, noticeTitle: { color: colors.deep, fontSize: 13, fontWeight: '700' }, noticeText: { color: colors.deep, fontSize: 12, lineHeight: 18, marginTop: 4 },
  step: { gap: 10, marginTop: 8 }, stepTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, stepText: { color: colors.ink, fontSize: 13, lineHeight: 20 }, stepOf: { color: colors.muted, fontSize: 11 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 4 }, progress: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 12 },
});
