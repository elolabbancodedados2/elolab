import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CalendarClock, Loader2, Megaphone, Radio, RefreshCw, Send, SquareX } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { isValidDateTimeLocal, toDateTimeLocalValue } from '@/lib/dateTimeLocal';
import { cn } from '@/lib/utils';

type Destination = 'todos' | 'clinica' | 'plano';
type AnnouncementType = 'info' | 'sucesso' | 'atencao' | 'critico';
type Announcement = {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: AnnouncementType;
  destino: Destination;
  destino_id: string | null;
  inicia_em: string;
  termina_em: string | null;
  publicado: boolean;
  created_at: string;
};
type Clinic = { id: string; nome: string };
type Plan = { id: string; nome: string; slug: string };

const typeLabels: Record<AnnouncementType, string> = {
  info: 'Informação',
  sucesso: 'Sucesso',
  atencao: 'Atenção',
  critico: 'Crítico',
};
const destinationLabels: Record<Destination, string> = { todos: 'Todas as clínicas', clinica: 'Uma clínica', plano: 'Um plano' };

function dateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data inválida' : date.toLocaleString('pt-BR');
}

type Status = 'Publicado' | 'Programado' | 'Encerrado';
function statusOf(item: Announcement, now: number) {
  const isScheduled = item.publicado && new Date(item.inicia_em).getTime() > now;
  const isActive = item.publicado && !isScheduled && (!item.termina_em || new Date(item.termina_em).getTime() > now);
  const status: Status = !item.publicado || (!isActive && !isScheduled) ? 'Encerrado' : isScheduled ? 'Programado' : 'Publicado';
  return { isScheduled, isActive, status };
}

export default function PlatformComunicacao() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const publishLock = useRef(false);
  const [form, setForm] = useState({
    titulo: '', mensagem: '', tipo: 'info' as AnnouncementType,
    destino: 'todos' as Destination, destino_id: '',
    inicia_em: toDateTimeLocalValue(), termina_em: '',
  });
  const [announcementToEnd, setAnnouncementToEnd] = useState<Announcement | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | 'todos'>('todos');

  const clinics = useQuery({
    queryKey: ['platform-announcement-clinics'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('clinicas').select('id,nome').eq('arquivada', false).order('nome');
      if (error) throw error;
      return (data || []) as Clinic[];
    },
  });

  const plans = useQuery({
    queryKey: ['platform-announcement-plans'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('planos').select('id,nome,slug').eq('ativo', true).order('ordem');
      if (error) throw error;
      return (data || []) as Plan[];
    },
  });

  const announcements = useQuery({
    queryKey: ['platform-announcements'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('platform_announcements').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []) as Announcement[];
    },
  });

  const startValid = isValidDateTimeLocal(form.inicia_em);
  const endValid = !form.termina_em || isValidDateTimeLocal(form.termina_em);
  const endAfterStart = !form.termina_em || !startValid || !endValid || new Date(form.termina_em).getTime() > new Date(form.inicia_em).getTime();
  const endInFuture = !form.termina_em || !endValid || new Date(form.termina_em).getTime() > Date.now();
  const destinationReady = form.destino === 'todos' || !!form.destino_id;
  const destinationOptions = useMemo(() => form.destino === 'clinica' ? clinics.data || [] : plans.data || [], [form.destino, clinics.data, plans.data]);
  const destinationLoading = form.destino === 'clinica' ? clinics.isLoading : form.destino === 'plano' ? plans.isLoading : false;
  const destinationError = form.destino === 'clinica' ? clinics.isError : form.destino === 'plano' ? plans.isError : false;
  const updatingOptions = clinics.isFetching || plans.isFetching || announcements.isFetching;
  const invalid = form.titulo.trim().length < 3 || form.mensagem.trim().length < 5 || !startValid || !endValid || !endAfterStart || !endInFuture || !destinationReady;

  const publish = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('platform_announcements').insert({
        titulo: form.titulo.trim(),
        mensagem: form.mensagem.trim(),
        tipo: form.tipo,
        destino: form.destino,
        destino_id: form.destino === 'todos' ? null : form.destino_id,
        inicia_em: new Date(form.inicia_em).toISOString(),
        termina_em: form.termina_em ? new Date(form.termina_em).toISOString() : null,
        publicado: true,
        criado_por: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm((current) => ({ ...current, titulo: '', mensagem: '' }));
      toast.success('Comunicado publicado.');
      void queryClient.invalidateQueries({ queryKey: ['platform-announcements'] });
    },
    onError: (error) => toast.error('Não foi possível publicar o comunicado.', { description: mensagemDeErro(error) }),
    onSettled: () => { publishLock.current = false; },
  });

  const endAnnouncement = useMutation({
    mutationFn: async (announcement: Announcement) => {
      const { error } = await (supabase as any)
        .from('platform_announcements')
        .update({ publicado: false })
        .eq('id', announcement.id)
        .eq('publicado', true)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      const { data } = await (supabase as any)
        .from('platform_announcements')
        .select('id')
        .eq('id', announcement.id)
        .eq('publicado', false)
        .maybeSingle();
      if (!data) throw new Error('O comunicado mudou antes do encerramento. Atualize o histórico e tente novamente.');
    },
    onSuccess: () => {
      setAnnouncementToEnd(null);
      toast.success('Comunicado encerrado.');
      void queryClient.invalidateQueries({ queryKey: ['platform-announcements'] });
    },
    onError: (error) => toast.error('Não foi possível encerrar o comunicado.', { description: mensagemDeErro(error) }),
  });

  const destinationName = (item: Announcement) => {
    if (item.destino === 'todos') return destinationLabels.todos;
    if (item.destino === 'clinica') return clinics.data?.find((clinic) => clinic.id === item.destino_id)?.nome || `Clínica (${item.destino_id || 'sem identificação'})`;
    return plans.data?.find((plan) => plan.slug === item.destino_id)?.nome || `Plano (${item.destino_id || 'sem identificação'})`;
  };
  const now = Date.now();
  const history = announcements.data ?? [];
  const counts = history.reduce((acc, item) => ({ ...acc, [statusOf(item, now).status]: acc[statusOf(item, now).status] + 1 }), { Publicado: 0, Programado: 0, Encerrado: 0 } as Record<Status, number>);
  const visibleHistory = statusFilter === 'todos' ? history : history.filter((item) => statusOf(item, now).status === statusFilter);
  const kpis = [
    { value: 'todos' as const, label: 'Comunicados', count: history.length, detail: 'no histórico recente', icon: Megaphone, color: '' },
    { value: 'Publicado' as const, label: 'Visíveis agora', count: counts.Publicado, detail: 'publicados e no período', icon: Radio, color: 'bg-success/10 text-success' },
    { value: 'Programado' as const, label: 'Programados', count: counts.Programado, detail: 'começam no futuro', icon: CalendarClock, color: 'bg-info/10 text-info' },
    { value: 'Encerrado' as const, label: 'Encerrados', count: counts.Encerrado, detail: 'fora do ar', icon: Archive, color: 'bg-muted text-muted-foreground' },
  ];
  const handlePublish = () => {
    if (publishLock.current || invalid || destinationLoading || destinationError) return;
    publishLock.current = true;
    publish.mutate();
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="Comunicação global"
        icon={<Megaphone />}
        description={history.length
          ? `${counts.Publicado} visíveis agora · ${counts.Programado} programados · ${counts.Encerrado} encerrados`
          : 'Envie avisos para todas as clínicas, uma clínica específica ou clientes de um plano.'}
        actions={
          <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={() => { void clinics.refetch(); void plans.refetch(); void announcements.refetch(); }} disabled={updatingOptions} aria-label="Atualizar dados">
            <RefreshCw className={cn('h-4 w-4', updatingOptions && 'animate-spin')} />
          </Button>
        }
      />

      {history.length > 0 && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicadores de comunicados">
          {kpis.map(({ value, label, count, detail, icon: Icon, color }) => {
            const highlight = value === 'todos';
            return (
              <button
                key={value}
                type="button"
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
                className={cn(
                  'rounded-2xl border border-border/60 bg-card p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  highlight && 'border-transparent bg-gradient-primary text-white',
                  statusFilter === value && !highlight && 'border-primary ring-1 ring-primary/30',
                  statusFilter === value && highlight && 'ring-2 ring-primary/40 ring-offset-2',
                )}
              >
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', highlight ? 'bg-white/20 text-white' : color)}><Icon className="h-5 w-5" /></span>
                <p className="mt-3 text-2xl font-bold tabular-nums">{count}</p>
                <p className={cn('text-sm font-medium', highlight ? 'text-white' : 'text-foreground')}>{label}</p>
                <p className={cn('text-[11px]', highlight ? 'text-white/70' : 'text-muted-foreground')}>{detail}</p>
              </button>
            );
          })}
        </section>
      )}

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle>Novo comunicado</CardTitle>
          <CardDescription>Defina o público e o período de exibição. Comunicados críticos devem informar impacto e orientação com clareza.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Título</Label>
              <Input id="announcement-title" value={form.titulo} maxLength={160} disabled={publish.isPending} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Instabilidade no envio de notificações" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-type">Tipo</Label>
              <Select value={form.tipo} disabled={publish.isPending} onValueChange={(tipo) => setForm((current) => ({ ...current, tipo: tipo as AnnouncementType }))}>
                <SelectTrigger id="announcement-type"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(typeLabels) as AnnouncementType[]).map((type) => <SelectItem key={type} value={type}>{typeLabels[type]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="announcement-message">Mensagem</Label>
              <Textarea id="announcement-message" value={form.mensagem} maxLength={5000} rows={4} disabled={publish.isPending} onChange={(event) => setForm((current) => ({ ...current, mensagem: event.target.value }))} placeholder="Explique o que aconteceu, quem é afetado e quais ações são necessárias." />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="announcement-destination">Público</Label>
              <Select value={form.destino} disabled={publish.isPending} onValueChange={(destino) => setForm((current) => ({ ...current, destino: destino as Destination, destino_id: '' }))}>
                <SelectTrigger id="announcement-destination"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as clínicas</SelectItem>
                  <SelectItem value="clinica">Uma clínica</SelectItem>
                  <SelectItem value="plano">Um plano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.destino !== 'todos' && <div className="space-y-2">
              <Label htmlFor="announcement-target">{form.destino === 'clinica' ? 'Clínica' : 'Plano'}</Label>
              <Select value={form.destino_id} disabled={publish.isPending || destinationLoading || destinationError} onValueChange={(destino_id) => setForm((current) => ({ ...current, destino_id }))}>
                <SelectTrigger id="announcement-target"><SelectValue placeholder={form.destino === 'clinica' ? 'Selecione a clínica' : 'Selecione o plano'} /></SelectTrigger>
                <SelectContent>{destinationOptions.map((option) => <SelectItem key={form.destino === 'clinica' ? (option as Clinic).id : (option as Plan).slug} value={form.destino === 'clinica' ? (option as Clinic).id : (option as Plan).slug}>{option.nome}</SelectItem>)}</SelectContent>
              </Select>
              {destinationLoading && <p className="text-xs text-muted-foreground">Carregando opções…</p>}
              {destinationError && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive"><span>Não foi possível carregar as opções.</span><Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => void (form.destino === 'clinica' ? clinics.refetch() : plans.refetch())}>Tentar novamente</Button></div>}
              {!destinationLoading && !destinationError && destinationOptions.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma opção ativa encontrada.</p>}
            </div>}
            <div className="space-y-2">
              <Label htmlFor="announcement-start">Exibir a partir de</Label>
              <Input id="announcement-start" type="datetime-local" value={form.inicia_em} disabled={publish.isPending} onChange={(event) => setForm((current) => ({ ...current, inicia_em: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-end">Ocultar em <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="announcement-end" type="datetime-local" value={form.termina_em} disabled={publish.isPending} onChange={(event) => setForm((current) => ({ ...current, termina_em: event.target.value }))} />
              {!endAfterStart && <p role="alert" className="text-xs text-destructive">A data final deve ser posterior ao início.</p>}
              {!endInFuture && <p role="alert" className="text-xs text-destructive">A data final precisa estar no futuro para o comunicado não nascer encerrado.</p>}
            </div>
          </div>

          <Button className="min-h-11 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={handlePublish} disabled={invalid || publish.isPending || destinationLoading || destinationError}>
            {publish.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Publicar comunicado
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Histórico de comunicados</CardTitle>
            <CardDescription>Até os 100 comunicados mais recentes.</CardDescription>
          </div>
          {history.length > 0 && (
            <div className="flex items-center gap-2">
              {statusFilter !== 'todos' && <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setStatusFilter('todos')}>Limpar filtros</Button>}
              <span className="text-xs text-muted-foreground" aria-live="polite">{visibleHistory.length} de {history.length}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {announcements.isLoading ? (
            [1, 2, 3].map((item) => <Skeleton key={item} className="h-24 w-full rounded-xl" />)
          ) : announcements.isError ? (
            <div role="alert" className="rounded-xl border border-destructive/30 p-4">
              <p className="font-medium">Não foi possível carregar o histórico.</p>
              <p className="mt-1 text-sm text-muted-foreground">{mensagemDeErro(announcements.error)}</p>
              <Button className="mt-3 rounded-full" variant="outline" onClick={() => void announcements.refetch()}>Tentar novamente</Button>
            </div>
          ) : history.length ? (
            visibleHistory.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum comunicado com este status.</p>
            ) : visibleHistory.map((item) => {
              const starts = dateTime(item.inicia_em);
              const ends = dateTime(item.termina_em);
              const { isScheduled, isActive, status } = statusOf(item, now);
              return (
                <article key={item.id} className={cn('rounded-xl border border-border/60 p-4', isActive && 'border-border bg-secondary')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold">{item.titulo}</h2>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.mensagem}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.tipo === 'critico' ? 'destructive' : item.tipo === 'atencao' ? 'secondary' : 'outline'} className="rounded-full">{typeLabels[item.tipo] || item.tipo}</Badge>
                      <Badge variant="outline" className={cn('rounded-full', status === 'Publicado' && 'border-transparent bg-gradient-primary text-white', status === 'Programado' && 'border-border text-primary')}>{status}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Público: {destinationName(item)}</span>
                    <span>Exibição: {starts || 'Data indisponível'}{ends ? ` até ${ends}` : ' · sem data final'}</span>
                    {isActive && <span>{item.termina_em ? 'Visível para o público agora' : 'Visível sem data final'}</span>}
                  </div>
                  {isActive && <Button className="mt-4 h-9 rounded-full text-xs text-destructive hover:text-destructive" size="sm" variant="ghost" onClick={() => setAnnouncementToEnd(item)} disabled={endAnnouncement.isPending}>
                    {endAnnouncement.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SquareX className="mr-2 h-4 w-4" />}
                    Encerrar comunicado
                  </Button>}
                </article>
              );
            })
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-border p-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><Megaphone className="h-6 w-6" /></span>
              <p className="mt-3 font-medium text-foreground">Nenhum comunicado ainda</p>
              <p className="mt-1 text-sm text-muted-foreground">Os avisos publicados aparecerão nesta lista. Use o formulário acima para enviar o primeiro.</p>
              <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={() => document.getElementById('announcement-title')?.focus()}>Escrever comunicado</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!announcementToEnd} onOpenChange={(open) => !open && !endAnnouncement.isPending && setAnnouncementToEnd(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar comunicado?</AlertDialogTitle>
            <AlertDialogDescription>“{announcementToEnd?.titulo}” deixará de aparecer imediatamente para as clínicas destinatárias. O registro será mantido no histórico.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endAnnouncement.isPending}>Manter publicado</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); if (announcementToEnd) endAnnouncement.mutate(announcementToEnd); }} disabled={endAnnouncement.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {endAnnouncement.isPending ? 'Encerrando…' : 'Encerrar agora'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
