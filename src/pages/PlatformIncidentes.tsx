import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Flame, Loader2, Plus, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type Incident = {
  id: string;
  title: string;
  summary: string;
  severity: 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  affected_services: string[];
  started_at: string;
  resolved_at: string | null;
};

type IncidentUpdate = { id: string; incident_id: string; message: string; status: Incident['status'] | null; created_at: string };
type IncidentForm = { id: string; title: string; status: Incident['status']; message: string };

const statusLabels: Record<Incident['status'], string> = {
  investigating: 'Investigando',
  identified: 'Causa identificada',
  monitoring: 'Monitorando',
  resolved: 'Resolvido',
};
const severityLabels: Record<Incident['severity'], string> = { minor: 'Menor', major: 'Maior', critical: 'Crítico' };

type FiltroIncidente = 'todos' | 'ativos' | 'criticos' | 'resolvidos';
const filtrosIncidente: Record<FiltroIncidente, { label: string; teste: (incident: Incident) => boolean }> = {
  todos: { label: 'Todos', teste: () => true },
  ativos: { label: 'Ativos', teste: (incident) => incident.status !== 'resolved' },
  criticos: { label: 'Críticos ativos', teste: (incident) => incident.status !== 'resolved' && incident.severity === 'critical' },
  resolvidos: { label: 'Resolvidos', teste: (incident) => incident.status === 'resolved' },
};

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

export default function PlatformIncidentes() {
  const queryClient = useQueryClient();
  const createLock = useRef(false);
  const updateLock = useRef(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [severity, setSeverity] = useState<Incident['severity']>('minor');
  const [updateForm, setUpdateForm] = useState<IncidentForm | null>(null);
  const [filtro, setFiltro] = useState<FiltroIncidente>('todos');

  const incidents = useQuery({
    queryKey: ['platform-incidents'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('platform_incidents').select('*').order('started_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Incident[];
    },
    refetchInterval: 60_000,
  });

  const updates = useQuery({
    queryKey: ['platform-incident-updates'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('platform_incident_updates').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as IncidentUpdate[];
    },
    refetchInterval: 60_000,
  });

  const createIncident = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc('platform_open_incident', {
        p_title: title.trim(),
        p_summary: summary.trim(),
        p_severity: severity,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle('');
      setSummary('');
      setSeverity('minor');
      toast.success('Incidente aberto.');
      void queryClient.invalidateQueries({ queryKey: ['platform-incidents'] });
      void queryClient.invalidateQueries({ queryKey: ['platform-incident-updates'] });
    },
    onError: (error) => toast.error('Não foi possível abrir o incidente.', { description: mensagemDeErro(error) }),
    onSettled: () => { createLock.current = false; },
  });

  const saveUpdate = useMutation({
    mutationFn: async (form: IncidentForm) => {
      const { error } = await (supabase as any).rpc('platform_update_incident', {
        p_id: form.id,
        p_status: form.status,
        p_message: form.message.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setUpdateForm(null);
      toast.success('Status e linha do tempo atualizados.');
      void queryClient.invalidateQueries({ queryKey: ['platform-incidents'] });
      void queryClient.invalidateQueries({ queryKey: ['platform-incident-updates'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o incidente.', { description: mensagemDeErro(error) }),
    onSettled: () => { updateLock.current = false; },
  });

  const abrirIncidente = title.trim().length >= 5 && title.trim().length <= 160 && summary.trim().length >= 10 && summary.trim().length <= 2000;
  const salvarAtualizacao = !!updateForm && updateForm.message.trim().length >= 3 && updateForm.message.trim().length <= 2000;
  const handleCreate = () => {
    if (createLock.current || !abrirIncidente) return;
    createLock.current = true;
    createIncident.mutate();
  };
  const handleSaveUpdate = () => {
    if (updateLock.current || !updateForm || !salvarAtualizacao) return;
    updateLock.current = true;
    saveUpdate.mutate(updateForm);
  };
  const updatesByIncident = (updates.data || []).reduce<Record<string, IncidentUpdate[]>>((groups, update) => {
    (groups[update.incident_id] ||= []).push(update);
    return groups;
  }, {});
  const todos = incidents.data || [];
  const contagem = (f: FiltroIncidente) => todos.filter(filtrosIncidente[f].teste).length;
  const visiveis = todos.filter(filtrosIncidente[filtro].teste);
  const indicadores = [
    { f: 'ativos' as const, icon: AlertTriangle, cor: 'bg-white/20 text-white', legenda: 'em investigação ou monitoramento' },
    { f: 'criticos' as const, icon: Flame, cor: 'bg-destructive/10 text-destructive', legenda: 'severidade crítica ainda abertos' },
    { f: 'resolvidos' as const, icon: CheckCircle2, cor: 'bg-success/10 text-success', legenda: 'com resolução registrada' },
  ];

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Gestão de incidentes"
        icon={<AlertTriangle />}
        description={incidents.data
          ? `${contagem('ativos')} incidentes ativos · ${contagem('criticos')} críticos · ${contagem('resolvidos')} resolvidos`
          : 'Registre impacto, mantenha a linha do tempo e acompanhe a resolução da plataforma.'}
        actions={<>
          <Button asChild variant="outline" className="rounded-full gap-2"><Link to="/admin/saude"><Activity className="h-4 w-4" />Saúde da plataforma</Link></Button>
          <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Atualizar" onClick={() => { void incidents.refetch(); void updates.refetch(); }} disabled={createIncident.isPending || saveUpdate.isPending || incidents.isFetching || updates.isFetching}>
            <RefreshCw className={cn('h-4 w-4', (incidents.isFetching || updates.isFetching) && 'animate-spin')} />
          </Button>
        </>}
      />

      {incidents.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {indicadores.map(({ f, icon: Icon, cor, legenda }, i) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(filtro === f ? 'todos' : f)}
              className={cn(
                'flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                i === 0 && 'col-span-2 border-transparent bg-gradient-primary text-white sm:col-span-1',
                filtro === f && 'ring-2 ring-[#1080CA]/40',
              )}
            >
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cor)}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-2xl font-bold tabular-nums">{contagem(f)}</span>
                <span className={cn('block text-[11px] font-medium', i === 0 ? 'text-white/80' : 'text-muted-foreground')}>{filtrosIncidente[f].label}</span>
                <span className={cn('block text-[10px]', i === 0 ? 'text-white/70' : 'text-muted-foreground/70')}>{legenda}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Abrir incidente</CardTitle>
          <CardDescription>Registre impacto operacional sem incluir dados clínicos ou informações de pacientes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(14rem,1fr)_minmax(18rem,2fr)_12rem_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="incident-title">Título</Label>
            <Input id="incident-title" value={title} maxLength={160} disabled={createIncident.isPending} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: lentidão no envio de notificações" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="incident-impact">Impacto observado</Label>
            <Textarea id="incident-impact" value={summary} maxLength={2000} disabled={createIncident.isPending} onChange={(event) => setSummary(event.target.value)} placeholder="Quais serviços e clientes foram afetados?" rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="incident-severity">Severidade</Label>
            <Select value={severity} disabled={createIncident.isPending} onValueChange={(value) => setSeverity(value as Incident['severity'])}>
              <SelectTrigger id="incident-severity"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minor">Menor</SelectItem>
                <SelectItem value="major">Maior</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="min-h-11 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={handleCreate} disabled={!abrirIncidente || createIncident.isPending}>
            {createIncident.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Abrir incidente
          </Button>
        </CardContent>
      </Card>

      <section aria-label="Incidentes registrados" className="space-y-3">
        {incidents.data && todos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(filtrosIncidente) as FiltroIncidente[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  filtro === f ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-[#DCE6F2] bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground',
                )}
              >
                {filtrosIncidente[f].label} ({contagem(f)})
              </button>
            ))}
            {filtro !== 'todos' && <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={() => setFiltro('todos')}>Limpar filtros</Button>}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{visiveis.length} de {todos.length}</span>
          </div>
        )}
        {incidents.isLoading ? (
          [1, 2].map((item) => <Skeleton key={item} className="h-48 w-full rounded-2xl" />)
        ) : incidents.isError ? (
          <Card className="rounded-2xl border-destructive/30 shadow-xs"><CardContent className="py-6" role="alert">
            <p className="font-medium">Não foi possível carregar os incidentes.</p>
            <p className="mt-1 text-sm text-muted-foreground">{mensagemDeErro(incidents.error)}</p>
            <Button className="mt-3 rounded-full" variant="outline" onClick={() => void incidents.refetch()}>Tentar novamente</Button>
          </CardContent></Card>
        ) : todos.length > 0 && visiveis.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-border/60 shadow-xs"><CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><CheckCircle2 className="h-6 w-6" /></span>
            <p className="font-medium text-foreground">Nenhum incidente neste filtro</p>
            <Button variant="outline" className="rounded-full" onClick={() => setFiltro('todos')}>Limpar filtros</Button>
          </CardContent></Card>
        ) : visiveis.length ? (
          visiveis.map((incident) => {
            const timeline = [...(updatesByIncident[incident.id] || [])].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
            return (
              <Card key={incident.id} className={cn('rounded-2xl border-border/60 shadow-xs', incident.status !== 'resolved' && incident.severity === 'critical' && 'border-destructive/40')}>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{incident.title}</h2>
                        <Badge variant={incident.severity === 'critical' ? 'destructive' : 'outline'} className={cn('rounded-full', incident.severity === 'major' && 'border-warning/40 text-warning')}>{severityLabels[incident.severity]}</Badge>
                        <Badge variant="outline" className={cn('rounded-full', incident.status === 'resolved' ? 'border-success/30 text-success' : 'border-transparent bg-gradient-primary text-white')}>{statusLabels[incident.status]}</Badge>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{incident.summary}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" /> Início: {dateTime(incident.started_at)}{incident.resolved_at ? ` · Resolvido: ${dateTime(incident.resolved_at)}` : ''}</p>
                    </div>
                    <Button
                      className="min-h-11 shrink-0 rounded-full"
                      variant="outline"
                      onClick={() => setUpdateForm({
                        id: incident.id,
                        title: incident.title,
                        status: incident.status === 'resolved' ? 'investigating' : incident.status,
                        message: '',
                      })}
                    >
                      {incident.status === 'resolved' ? 'Reabrir incidente' : 'Atualizar status'}
                    </Button>
                  </div>

                  <div className="border-t pt-3">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><Activity className="h-4 w-4" /> Linha do tempo</h3>
                    {updates.isError ? (
                      <p className="text-sm text-destructive">Não foi possível carregar as atualizações. {mensagemDeErro(updates.error)}</p>
                    ) : updates.isLoading ? (
                      <Skeleton className="h-12 w-full" />
                    ) : timeline.length ? (
                      <ol className="space-y-2">
                        {timeline.map((update) => (
                          <li key={update.id} className="rounded-xl border-l-2 border-[#BFD8EE] bg-[#F3F8FC] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              {update.status && <Badge variant="outline" className="rounded-full border-[#BFD8EE] text-[#1080CA]">{statusLabels[update.status]}</Badge>}
                              <time className="text-xs text-muted-foreground">{dateTime(update.created_at)}</time>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm">{update.message}</p>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma atualização registrada ainda.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="rounded-2xl border-dashed border-border/60 shadow-xs"><CardContent className="flex flex-col items-center py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><CheckCircle2 className="h-6 w-6" /></span>
            <p className="mt-3 font-medium text-foreground">Nenhum incidente registrado</p>
            <p className="mt-1 text-sm text-muted-foreground">Incidentes ativos e resolvidos aparecerão nesta lista. Se algo estiver fora do ar, use o formulário acima ou confira a saúde da plataforma.</p>
            <Button asChild variant="outline" className="mt-4 rounded-full"><Link to="/admin/saude">Ver saúde da plataforma</Link></Button>
          </CardContent></Card>
        )}
      </section>

      {updates.data?.length === 500 && <p role="status" className="text-xs text-muted-foreground">A linha do tempo carrega os 500 eventos mais recentes da plataforma; eventos mais antigos podem não aparecer neste painel.</p>}

      <Dialog open={!!updateForm} onOpenChange={(open) => !open && !saveUpdate.isPending && setUpdateForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar incidente</DialogTitle>
            <DialogDescription>{updateForm?.title}. A mudança e a justificativa serão incluídas na linha do tempo.</DialogDescription>
          </DialogHeader>
          {updateForm && <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="incident-next-status">Novo status</Label>
              <Select value={updateForm.status} disabled={saveUpdate.isPending} onValueChange={(status) => setUpdateForm((current) => current ? { ...current, status: status as Incident['status'] } : current)}>
                <SelectTrigger id="incident-next-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="investigating">Investigando</SelectItem>
                  <SelectItem value="identified">Causa identificada</SelectItem>
                  <SelectItem value="monitoring">Monitorando</SelectItem>
                  <SelectItem value="resolved">Resolvido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="incident-update-message">O que mudou? *</Label>
              <Textarea id="incident-update-message" value={updateForm.message} maxLength={2000} rows={4} disabled={saveUpdate.isPending} onChange={(event) => setUpdateForm((current) => current ? { ...current, message: event.target.value } : current)} placeholder="Descreva as verificações, a causa identificada ou a resolução aplicada." />
              <p className="text-xs text-muted-foreground">Mínimo de 3 caracteres. Não inclua dados clínicos.</p>
            </div>
          </div>}
          <DialogFooter>
            <Button variant="outline" className="min-h-11 rounded-full" onClick={() => setUpdateForm(null)} disabled={saveUpdate.isPending}>Cancelar</Button>
            <Button className="min-h-11 rounded-full bg-gradient-primary text-white hover:brightness-110" onClick={handleSaveUpdate} disabled={!salvarAtualizacao || saveUpdate.isPending}>
              {saveUpdate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar atualização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
