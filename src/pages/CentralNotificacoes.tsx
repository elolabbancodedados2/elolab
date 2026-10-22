import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Bell, BellDot, CalendarDays, CheckCheck, CircleDollarSign, ClipboardList, FlaskConical, Inbox, RefreshCw, RotateCcw, Search, ShieldAlert, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { groupNotificationsByEvent } from '@/lib/notificationDeduplication';

type Category = 'all' | 'tarefas' | 'consultas' | 'exames' | 'pagamentos' | 'retornos' | 'alertas';
interface Item { source_type:string; source_id:string; category:Exclude<Category,'all'>; severity:'info'|'warning'|'error'; title:string; message:string; occurred_at:string; href:string; is_read:boolean }
const categoryMeta = {
  tarefas:{label:'Tarefas',icon:ClipboardList}, consultas:{label:'Consultas',icon:CalendarDays}, exames:{label:'Exames',icon:FlaskConical},
  pagamentos:{label:'Pagamentos',icon:CircleDollarSign}, retornos:{label:'Retornos',icon:RotateCcw}, alertas:{label:'Alertas',icon:AlertTriangle},
} as const;
const plural = (n:number, um:string, varios:string) => `${n} ${n===1?um:varios}`;

export default function CentralNotificacoes() {
  const { user, profile } = useSupabaseAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [category,setCategory] = useState<Category>('all');
  const [onlyUnread,setOnlyUnread] = useState(false);
  const [onlyCritical,setOnlyCritical] = useState(false);
  const [period,setPeriod] = useState<'all'|'7d'|'30d'>('all');
  const [search,setSearch] = useState('');
  const [now,setNow] = useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60_000);return()=>window.clearInterval(timer);},[]);
  const query = useQuery({ queryKey:['central-notificacoes',user?.id,profile?.clinica_id], enabled:!!user&&!!profile?.clinica_id, refetchInterval:60_000,
    queryFn:async()=>{ const {data,error}=await (supabase as any).rpc('central_notificacoes_usuario',{p_limit:250}); if(error)throw error; return (data??[]) as Item[]; } });
  const events = useMemo(() => groupNotificationsByEvent(query.data ?? []), [query.data]);
  const filtered=useMemo(()=>{
    const cutoff = period === '7d' ? now - 7 * 86_400_000 : period === '30d' ? now - 30 * 86_400_000 : null;
    const normalizedSearch=normalizarTexto(search.trim());
    return events.filter(i=>{
      const withinPeriod = cutoff === null || new Date(i.occurred_at).getTime() >= cutoff;
      const matchesSearch=!normalizedSearch||normalizarTexto(`${i.title} ${i.message}`).includes(normalizedSearch);
      return (category==='all'||i.category===category)&&(!onlyUnread||!i.is_read)&&(!onlyCritical||i.severity==='error')&&withinPeriod&&matchesSearch;
    });
  },[events,category,onlyUnread,onlyCritical,period,search,now]);
  const unread=events.filter(i=>!i.is_read);
  const unreadVisiveis=filtered.filter(i=>!i.is_read);
  const criticas=events.filter(i=>i.severity==='error'&&!i.is_read).length;
  const exameResultados=events.filter(i=>i.category==='exames'&&!i.is_read).length;
  const unreadByCategory=useMemo(()=>{const counts:Record<string,number>={};for(const i of events)if(!i.is_read)counts[i.category]=(counts[i.category]??0)+1;return counts;},[events]);
  const hasFilters=category!=='all'||onlyUnread||onlyCritical||period!=='all'||!!search.trim();
  const reachedLimit=(query.data?.length??0)>=250;
  const clearFilters=()=>{setCategory('all');setOnlyUnread(false);setOnlyCritical(false);setPeriod('all');setSearch('');};
  const markRead=useMutation({ mutationFn:async(items:Item[])=>{if(!user||!profile?.clinica_id||!items.length)return; const {error}=await (supabase as any).from('user_notification_state').upsert(items.map(i=>({clinica_id:profile.clinica_id,user_id:user.id,source_type:i.source_type,source_id:i.source_id,read_at:new Date().toISOString()})));if(error)throw error;},
    onSuccess:()=>client.invalidateQueries({queryKey:['central-notificacoes']}), onError:()=>toast.error('Não foi possível atualizar o estado de leitura.') });
  const open=(i:Item)=>{
    // A falha ao salvar a leitura não pode impedir o usuário de abrir a pendência.
    if(!i.is_read)markRead.mutate([i]);
    navigate(i.href);
  };

  if(query.isLoading)return <div className="space-y-5" aria-label="Carregando notificações"><Skeleton className="h-16 max-w-xl"/><Skeleton className="h-10 w-full"/>{[1,2,3,4].map(i=><Skeleton key={i} className="h-24 w-full"/>)}</div>;
  if(query.isError)return <ErrorState title="Não foi possível abrir a central" error={query.error} onRetry={()=>query.refetch()}/>;

  const indicadores = [
    { key:'todas', label:'Todas', caption:'eventos carregados', value:events.length, icon:Inbox, pressed:!hasFilters, onClick:clearFilters, color:'text-[#1080CA]', surface:'bg-[#1080CA]/10' },
    { key:'nao-lidas', label:'Não lidas', caption:'aguardando sua leitura', value:unread.length, icon:BellDot, pressed:onlyUnread, onClick:()=>setOnlyUnread(v=>!v), destaque:true },
    { key:'criticas', label:'Críticas', caption:'não lidas, inclui resultado crítico', value:criticas, icon:ShieldAlert, pressed:onlyCritical, onClick:()=>setOnlyCritical(v=>!v), color:'text-destructive', surface:'bg-destructive/10' },
    { key:'exames', label:'Exames', caption:'resultados não lidos', value:exameResultados, icon:FlaskConical, pressed:category==='exames', onClick:()=>setCategory(c=>c==='exames'?'all':'exames'), color:'text-info', surface:'bg-info/10' },
  ];

  return <div className="mx-auto max-w-5xl space-y-5 pb-10">
    <PageHeader
      title="Central de notificações"
      description={events.length
        ? `${plural(events.length,'notificação','notificações')} · ${plural(unread.length,'não lida','não lidas')}${criticas?` · ${plural(criticas,'crítica','críticas')}`:''}`
        : 'Consultas, tarefas e pendências importantes para o seu perfil.'}
      icon={<Bell />}
      actions={<>
        <Button variant="outline" size="icon" className="rounded-full" onClick={()=>query.refetch()} disabled={query.isFetching} aria-label="Atualizar notificações" title="Atualizar notificações">
          <RefreshCw className={cn('h-4 w-4',query.isFetching&&'animate-spin')}/>
        </Button>
        {unread.length>unreadVisiveis.length&&<Button variant="outline" className="gap-2 rounded-full" onClick={()=>markRead.mutate(unread)} disabled={markRead.isPending}>
          <CheckCheck className="h-4 w-4"/>
          Marcar todas como lidas ({unread.length})
        </Button>}
        <Button className="gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={()=>markRead.mutate(unreadVisiveis)} disabled={!unreadVisiveis.length||markRead.isPending}>
          <CheckCheck className="h-4 w-4"/>
          Marcar {unreadVisiveis.length} visível{unreadVisiveis.length===1?'':'is'} como lida{unreadVisiveis.length===1?'':'s'}
        </Button>
      </>}
    />

    <section role="group" aria-label="Indicadores de notificações" className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {indicadores.map(k=>{const Icon=k.icon;return <button key={k.key} type="button" aria-pressed={k.pressed} onClick={k.onClick}
        className={cn('rounded-2xl border border-border/60 bg-card p-3 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
          k.destaque&&'border-transparent bg-gradient-primary text-white',
          k.pressed&&!k.destaque&&'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
          k.pressed&&k.destaque&&'ring-2 ring-[#1080CA]/60 ring-offset-2')}>
        <div className="flex min-h-[64px] items-center gap-3">
          <span aria-hidden="true" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',k.destaque?'bg-white/20 text-white':cn(k.surface,k.color))}><Icon className="h-5 w-5"/></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={cn('truncate text-xs font-semibold',k.destaque?'text-white/85':'text-foreground')}>{k.label}</span>
              <span className={cn('text-2xl font-bold tabular-nums',k.destaque?'text-white':k.color)}>{k.value}</span>
            </span>
            <span className={cn('block truncate text-[11px]',k.destaque?'text-white/70':'text-muted-foreground')}>{k.caption}</span>
          </span>
        </div>
      </button>;})}
    </section>

    <div className="flex flex-col gap-3">
      <Tabs value={category} onValueChange={v=>setCategory(v as Category)} className="overflow-x-auto">
        <TabsList className="h-auto min-w-max flex-wrap justify-start gap-1">
          <TabsTrigger value="all">Todas</TabsTrigger>
          {Object.entries(categoryMeta).map(([key,m])=><TabsTrigger key={key} value={key} className="group gap-1.5">{m.label}{unreadByCategory[key]?<span aria-hidden="true" className="rounded-full bg-[#1080CA]/10 px-1.5 text-[10px] tabular-nums text-[#1080CA] group-data-[state=active]:bg-white/20">{unreadByCategory[key]}</span>:null}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <Input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar por título ou conteúdo" aria-label="Buscar notificações" className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"/>
        </div>
        <Select value={period} onValueChange={v=>setPeriod(v as typeof period)}>
          <SelectTrigger className="h-10 w-full rounded-full sm:w-44" aria-label="Período das notificações"><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="all">Qualquer período</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem><SelectItem value="30d">Últimos 30 dias</SelectItem></SelectContent>
        </Select>
        {hasFilters&&<Button variant="ghost" size="sm" className="h-10 gap-1.5 rounded-full text-muted-foreground" onClick={clearFilters}><X aria-hidden="true" className="h-3.5 w-3.5"/> Limpar filtros</Button>}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">{filtered.length} de {plural(events.length,'notificação','notificações')}</p>
      </div>
    </div>
    {reachedLimit&&<p className="text-xs text-muted-foreground" role="status">Exibindo até as 250 notificações mais recentes. A busca e os filtros consideram este conjunto.</p>}
    {!filtered.length
      ?<Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="flex flex-col items-center py-14 text-center">
        <span aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><CheckCheck className="h-7 w-7"/></span>
        <h2 className="font-semibold text-foreground">{events.length?'Nenhuma notificação encontrada':'Nenhuma notificação por enquanto'}</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{events.length?'Ajuste a busca ou os filtros para encontrar outras notificações.':'Novas pendências aparecerão aqui automaticamente.'}</p>
        {hasFilters&&<Button className="mt-4 rounded-full" variant="outline" onClick={clearFilters}>Limpar busca e filtros</Button>}
      </CardContent></Card>
      :<div className="space-y-2">{filtered.map(i=>{
        const meta=categoryMeta[i.category]??categoryMeta.alertas;const Icon=i.severity==='error'?ShieldAlert:meta.icon;
        const critica=i.severity==='error';
        const severityLabel=critica?'Crítica':i.severity==='warning'?'Atenção':'Informativa';
        return <button key={`${i.source_type}-${i.source_id}`} type="button" onClick={()=>open(i)}
          className={cn('flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-xs transition-colors hover:border-[#9CC7EC] hover:bg-[#F3F8FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
            !i.is_read&&!critica&&'border-[#BFD8EE] bg-[#F3F8FC]/60',
            critica&&'border-l-4 border-destructive/40 border-l-destructive',
            critica&&!i.is_read&&'bg-destructive/[0.04] hover:bg-destructive/[0.07] hover:border-destructive/50')}>
          <span aria-hidden="true" className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',critica?'bg-destructive/10 text-destructive':i.severity==='warning'?'bg-warning/10 text-warning':'bg-[#1080CA]/10 text-[#1080CA]')}><Icon className="h-5 w-5"/></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('font-medium',critica&&'text-destructive')}>{i.title}</span>
              {i.duplicateCount>1&&<Badge variant="secondary" className="rounded-full text-[10px]">{i.duplicateCount} ocorrências</Badge>}
              {!i.is_read&&<span className={cn('h-2 w-2 rounded-full',critica?'bg-destructive':'bg-[#1080CA]')} aria-label="Não lida"/>}
              <Badge variant={critica?'destructive':'outline'} className={cn('rounded-full text-[10px]',i.severity==='warning'&&'border-warning/30 bg-warning/10 text-warning')}>{severityLabel}</Badge>
              <Badge variant="outline" className="rounded-full border-[#BFD8EE] text-[10px] text-[#1080CA]">{meta.label}</Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{i.message}</p>
            <p className="mt-1.5 text-xs text-muted-foreground/70">{formatDistanceToNow(new Date(i.occurred_at),{addSuffix:true,locale:ptBR})}</p>
          </div>
        </button>;})}</div>}
  </div>;
}
