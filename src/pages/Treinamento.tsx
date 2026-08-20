import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpenCheck, Check, Loader2, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { AppRole } from '@/contexts/SupabaseAuthContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

type TutorialStep = { title: string; description: string; href?: string; action?: string };
type Tutorial = { key: string; title: string; description: string; minutes: number; roles: AppRole[]; steps: TutorialStep[] };

const tutorials: Tutorial[] = [
  { key: 'rotina-diaria', title: 'Comece o dia com segurança', description: 'Aprenda a identificar prioridades e pendências sem alterar registros.', minutes: 3, roles: ['admin','medico','recepcao','enfermagem','financeiro'], steps: [
    { title: 'Leia seu painel', description: 'Os atalhos e indicadores são adaptados à sua função. Comece pelas pendências que exigem atenção.', href: '/dashboard', action: 'Abrir dashboard' },
    { title: 'Confira as notificações', description: 'Use filtros e marque como lido somente o que você já conferiu.', href: '/notificacoes', action: 'Ver notificações' },
    { title: 'Organize as tarefas', description: 'Revise responsável, prazo e contexto antes de concluir uma tarefa.', href: '/tarefas', action: 'Abrir tarefas' },
  ]},
  { key: 'agenda-recepcao', title: 'Agenda e chegada do paciente', description: 'Pratique a sequência administrativa correta para um atendimento.', minutes: 4, roles: ['admin','recepcao'], steps: [
    { title: 'Pesquise antes de cadastrar', description: 'Procure nome e documento para evitar pacientes duplicados.', href: '/pacientes', action: 'Abrir pacientes' },
    { title: 'Confirme antes de agendar', description: 'Revise paciente, profissional, data e horário antes de salvar.', href: '/agenda', action: 'Abrir agenda' },
    { title: 'Registre a chegada', description: 'Encaminhe para a fila somente quando a presença estiver confirmada.', href: '/recepcao', action: 'Abrir recepção' },
  ]},
  { key: 'fluxo-clinico', title: 'Fluxo clínico responsável', description: 'Revise as etapas de triagem, atendimento e documentação.', minutes: 5, roles: ['admin','medico','enfermagem'], steps: [
    { title: 'Confirme a pessoa atendida', description: 'Antes de registrar qualquer dado, confira paciente e atendimento selecionados.' },
    { title: 'Finalize sua etapa', description: 'Só avance a fila depois de concluir e revisar as informações da etapa atual.', href: '/fila', action: 'Abrir fila' },
    { title: 'Revise documentos', description: 'Assine ou finalize documentos clínicos somente após a revisão completa.', href: '/documentos-clinicos', action: 'Abrir documentos' },
  ]},
  { key: 'financeiro-seguro', title: 'Rotina financeira confiável', description: 'Confira valores e estados antes de registrar movimentações.', minutes: 4, roles: ['admin','financeiro'], steps: [
    { title: 'Defina o período', description: 'Confirme datas e filtros para interpretar os totais corretamente.', href: '/financeiro', action: 'Abrir financeiro' },
    { title: 'Revise os dados', description: 'Confira valor, vencimento, favorecido e situação antes de uma baixa.', href: '/contas', action: 'Abrir contas' },
    { title: 'Valide o resultado', description: 'Após salvar, confirme a mensagem de sucesso e o novo estado do registro.' },
  ]},
  { key: 'privacidade-conta', title: 'Privacidade e segurança da conta', description: 'Boas práticas para proteger acessos e informações sensíveis.', minutes: 3, roles: ['admin','medico','recepcao','enfermagem','financeiro'], steps: [
    { title: 'Use sua própria conta', description: 'Nunca compartilhe senha ou sessão. Cada ação precisa ter autoria identificável.' },
    { title: 'Confira permissões', description: 'Se uma função não deveria acessar algo, informe o administrador em vez de compartilhar dados.' },
    { title: 'Proteja a sessão', description: 'Bloqueie ou encerre a sessão ao se afastar de um dispositivo compartilhado.', href: '/seguranca', action: 'Revisar segurança' },
  ]},
];

export default function Treinamento() {
  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<Tutorial | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const roles = profile?.roles ?? [];
  const visible = useMemo(() => tutorials.filter(t => t.roles.some(role => roles.includes(role))), [roles]);
  const progress = useQuery({
    queryKey: ['training-progress', user?.id, profile?.clinica_id],
    enabled: Boolean(user?.id && profile?.clinica_id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('user_training_progress').select('tutorial_key').eq('user_id', user!.id).eq('clinica_id', profile!.clinica_id);
      if (error) throw error;
      return new Set<string>((data ?? []).map((row: { tutorial_key: string }) => row.tutorial_key));
    },
  });
  const completed = progress.data ?? new Set<string>();
  const percentage = visible.length ? Math.round((visible.filter(t => completed.has(t.key)).length / visible.length) * 100) : 0;

  function start(tutorial: Tutorial) { setActive(tutorial); setStep(0); }
  async function finish() {
    if (!active || !user?.id || !profile?.clinica_id) return;
    setSaving(true);
    const { error } = await (supabase as any).from('user_training_progress').upsert({ user_id: user.id, clinica_id: profile.clinica_id, tutorial_key: active.key, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'user_id,clinica_id,tutorial_key' });
    setSaving(false);
    if (error) return toast.error('Não foi possível salvar o progresso', { description: 'O tutorial continua disponível. Tente concluir novamente.' });
    await queryClient.invalidateQueries({ queryKey: ['training-progress', user.id, profile.clinica_id] });
    setActive(null);
    toast.success('Tutorial concluído');
  }

  return <main className="mx-auto w-full max-w-6xl space-y-6 pb-24 sm:pb-8" aria-labelledby="training-title">
    <header className="space-y-2"><Badge variant="secondary">Aprendizado seguro</Badge><h1 id="training-title" className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl"><BookOpenCheck className="h-7 w-7 text-primary" aria-hidden="true"/>Central de treinamento</h1><p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">Roteiros curtos para dominar seu fluxo. Você pode repetir qualquer tutorial sem criar ou alterar dados da clínica.</p></header>
    <Alert className="border-primary/20 bg-primary/[0.03]"><ShieldCheck className="h-4 w-4 text-primary"/><AlertTitle>Treinamento sem dados fictícios</AlertTitle><AlertDescription>Os roteiros apenas orientam a navegação. Nenhum paciente, consulta, prontuário ou lançamento financeiro é criado automaticamente.</AlertDescription></Alert>
    {progress.isLoading ? <div className="space-y-3" aria-label="Carregando treinamentos"><Skeleton className="h-24 w-full"/><Skeleton className="h-48 w-full"/></div> : progress.isError ? <Alert variant="destructive"><AlertTitle>Não foi possível carregar seu progresso</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3">Tente novamente; nenhum dado foi perdido.<Button variant="outline" size="sm" onClick={() => progress.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Tentar novamente</Button></AlertDescription></Alert> : <>
      <Card><CardContent className="pt-6"><div className="mb-2 flex items-center justify-between gap-4 text-sm"><span className="font-medium">{visible.filter(t => completed.has(t.key)).length} de {visible.length} roteiros concluídos</span><span className="font-semibold text-primary">{percentage}%</span></div><Progress value={percentage} aria-label={`${percentage}% dos treinamentos concluídos`}/></CardContent></Card>
      <section className="grid gap-4 md:grid-cols-2" aria-label="Tutoriais disponíveis">{visible.map(tutorial => { const done = completed.has(tutorial.key); return <Card key={tutorial.key} className={done ? 'border-emerald-500/40' : ''}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{tutorial.title}</CardTitle><CardDescription className="mt-1 leading-5">{tutorial.description}</CardDescription></div>{done && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white" title="Concluído"><Check className="h-4 w-4" aria-hidden="true"/><span className="sr-only">Concluído</span></span>}</div></CardHeader><CardContent className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><span className="text-sm text-muted-foreground">{tutorial.steps.length} etapas · cerca de {tutorial.minutes} min</span><Button className="min-h-11 w-full sm:w-auto" variant={done ? 'outline' : 'default'} onClick={() => start(tutorial)}><Play className="mr-2 h-4 w-4" aria-hidden="true"/>{done ? 'Repetir tutorial' : 'Começar tutorial'}</Button></CardContent></Card>})}</section>
    </>}
    <Dialog open={Boolean(active)} onOpenChange={open => { if (!open && !saving) setActive(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" aria-describedby="training-step-description">{active && <><DialogHeader><Badge variant="outline" className="w-fit">Etapa {step + 1} de {active.steps.length}</Badge><DialogTitle>{active.steps[step].title}</DialogTitle><DialogDescription id="training-step-description" className="text-sm leading-6">{active.steps[step].description}</DialogDescription></DialogHeader><Progress value={((step + 1) / active.steps.length) * 100} aria-label={`Etapa ${step + 1} de ${active.steps.length}`}/>{active.steps[step].href && <Button variant="outline" className="min-h-11 w-full" asChild><Link to={active.steps[step].href!} onClick={() => setActive(null)}>{active.steps[step].action}<ArrowRight className="ml-2 h-4 w-4"/></Link></Button>}<DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button variant="ghost" className="min-h-11" disabled={step === 0 || saving} onClick={() => setStep(value => value - 1)}><ArrowLeft className="mr-2 h-4 w-4"/>Anterior</Button>{step < active.steps.length - 1 ? <Button className="min-h-11" onClick={() => setStep(value => value + 1)}>Próxima<ArrowRight className="ml-2 h-4 w-4"/></Button> : <Button className="min-h-11" disabled={saving} onClick={() => void finish()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Check className="mr-2 h-4 w-4"/>}{saving ? 'Salvando…' : 'Concluir tutorial'}</Button>}</DialogFooter></>}</DialogContent></Dialog>
  </main>;
}
