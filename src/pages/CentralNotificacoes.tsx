import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Bell, CalendarDays, CheckCheck, CircleDollarSign, ClipboardList, FlaskConical, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
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

type Category = 'all' | 'tarefas' | 'consultas' | 'exames' | 'pagamentos' | 'retornos' | 'alertas';
interface Item { source_type:string; source_id:string; category:Exclude<Category,'all'>; severity:'info'|'warning'|'error'; title:string; message:string; occurred_at:string; href:string; is_read:boolean }
const categoryMeta = {
  tarefas:{label:'Tarefas',icon:ClipboardList}, consultas:{label:'Consultas',icon:CalendarDays}, exames:{label:'Exames',icon:FlaskConical},
  pagamentos:{label:'Pagamentos',icon:CircleDollarSign}, retornos:{label:'Retornos',icon:RotateCcw}, alertas:{label:'Alertas',icon:AlertTriangle},
} as const;

export default function CentralNotificacoes() {
  const { user, profile } = useSupabaseAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [category,setCategory] = useState<Category>('all');
  const [onlyUnread,setOnlyUnread] = useState(false);
  const [period,setPeriod] = useState<'all'|'7d'|'30d'>('all');
  const [search,setSearch] = useState('');
  const [now,setNow] = useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60_000);return()=>window.clearInterval(timer);},[]);
  const query = useQuery({ queryKey:['central-notificacoes',user?.id,profile?.clinica_id], enabled:!!user&&!!profile?.clinica_id, refetchInterval:60_000,
    queryFn:async()=>{ const {data,error}=await (supabase as any).rpc('central_notificacoes_usuario',{p_limit:250}); if(error)throw error; return (data??[]) as Item[]; } });
  const filtered=useMemo(()=>{
    const cutoff = period === '7d' ? now - 7 * 86_400_000 : period === '30d' ? now - 30 * 86_400_000 : null;
    const normalizedSearch=normalizarTexto(search.trim());
    return (query.data??[]).filter(i=>{
      const withinPeriod = cutoff === null || new Date(i.occurred_at).getTime() >= cutoff;
      const matchesSearch=!normalizedSearch||normalizarTexto(`${i.title} ${i.message}`).includes(normalizedSearch);
      return (category==='all'||i.category===category)&&(!onlyUnread||!i.is_read)&&withinPeriod&&matchesSearch;
    });
  },[query.data,category,onlyUnread,period,search,now]);
  const unread=(query.data??[]).filter(i=>!i.is_read);
  const unreadVisiveis=filtered.filter(i=>!i.is_read);
  const hasFilters=category!=='all'||onlyUnread||period!=='all'||!!search.trim();
  const reachedLimit=(query.data?.length??0)>=250;
  const clearFilters=()=>{setCategory('all');setOnlyUnread(false);setPeriod('all');setSearch('');};
  const markRead=useMutation({ mutationFn:async(items:Item[])=>{if(!user||!profile?.clinica_id||!items.length)return; const {error}=await (supabase as any).from('user_notification_state').upsert(items.map(i=>({clinica_id:profile.clinica_id,user_id:user.id,source_type:i.source_type,source_id:i.source_id,read_at:new Date().toISOString()})));if(error)throw error;},
    onSuccess:()=>client.invalidateQueries({queryKey:['central-notificacoes']}), onError:()=>toast.error('Não foi possível atualizar o estado de leitura.') });
  const open=(i:Item)=>{
    // A falha ao salvar a leitura não pode impedir o usuário de abrir a pendência.
    if(!i.is_read)markRead.mutate([i]);
    navigate(i.href);
  };

  if(query.isLoading)return <div className="space-y-5" aria-label="Carregando notificações"><Skeleton className="h-16 max-w-xl"/><Skeleton className="h-10 w-full"/>{[1,2,3,4].map(i=><Skeleton key={i} className="h-24 w-full"/>)}</div>;
  if(query.isError)return <ErrorState title="Não foi possível abrir a central" error={query.error} onRetry={()=>query.refetch()}/>;
  return <div className="mx-auto max-w-5xl space-y-5 pb-10">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Bell className="h-6 w-6 text-primary"/>Central de notificações</h1><p className="mt-1 text-sm text-muted-foreground">Consultas, tarefas e pendências importantes para o seu perfil.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>query.refetch()} disabled={query.isFetching}><RefreshCw className={cn('mr-2 h-4 w-4',query.isFetching&&'animate-spin')}/>Atualizar</Button><Button onClick={()=>markRead.mutate(unreadVisiveis)} disabled={!unreadVisiveis.length||markRead.isPending}><CheckCheck className="mr-2 h-4 w-4"/>Marcar {unreadVisiveis.length} visível{unreadVisiveis.length===1?'':'is'} como lida{unreadVisiveis.length===1?'':'s'}</Button></div></div>
    <div className="flex flex-col gap-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><Tabs value={category} onValueChange={v=>setCategory(v as Category)} className="overflow-x-auto"><TabsList className="h-auto min-w-max flex-wrap justify-start"><TabsTrigger value="all">Todas</TabsTrigger>{Object.entries(categoryMeta).map(([key,m])=><TabsTrigger key={key} value={key}>{m.label}</TabsTrigger>)}</TabsList></Tabs><div className="flex flex-wrap items-center gap-2"><Select value={period} onValueChange={v=>setPeriod(v as typeof period)}><SelectTrigger className="w-40" aria-label="Período das notificações"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Qualquer período</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem><SelectItem value="30d">Últimos 30 dias</SelectItem></SelectContent></Select><Button variant={onlyUnread?'secondary':'outline'} size="sm" onClick={()=>setOnlyUnread(v=>!v)} aria-pressed={onlyUnread}>{onlyUnread?'Mostrando não lidas':'Mostrar apenas não lidas'}</Button></div></div><div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar por título ou conteúdo" aria-label="Buscar notificações" className="pl-9"/></div></div>
    <div className="flex items-center justify-between text-sm text-muted-foreground" aria-live="polite"><span>{filtered.length} {filtered.length===1?'notificação':'notificações'}</span>{unread.length>0&&<Badge variant="secondary">{unread.length} não {unread.length===1?'lida':'lidas'} no conjunto carregado</Badge>}</div>
    {reachedLimit&&<p className="text-xs text-muted-foreground" role="status">Exibindo até as 250 notificações mais recentes. A busca e os filtros consideram este conjunto.</p>}
    {!filtered.length?<Card><CardContent className="flex flex-col items-center py-14 text-center"><div className="mb-4 rounded-full bg-muted p-4"><CheckCheck className="h-7 w-7 text-muted-foreground"/></div><h2 className="font-semibold">{query.data?.length?'Nenhuma notificação encontrada':'Nenhuma notificação por enquanto'}</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">{query.data?.length?'Ajuste a busca ou os filtros para encontrar outras notificações.':'Novas pendências aparecerão aqui automaticamente.'}</p>{hasFilters&&<Button className="mt-4" variant="outline" onClick={clearFilters}>Limpar busca e filtros</Button>}</CardContent></Card>:<div className="space-y-2">{filtered.map(i=>{const meta=categoryMeta[i.category]??categoryMeta.alertas;const Icon=meta.icon;const severityLabel=i.severity==='error'?'Crítica':i.severity==='warning'?'Atenção':'Informativa';return <button key={`${i.source_type}-${i.source_id}`} type="button" onClick={()=>open(i)} className={cn('flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',!i.is_read&&'border-primary/30 bg-primary/[0.035]')}><div className={cn('mt-0.5 rounded-lg p-2',i.severity==='error'?'bg-destructive/10 text-destructive':i.severity==='warning'?'bg-warning/10 text-warning':'bg-primary/10 text-primary')}><Icon className="h-4 w-4"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{i.title}</span>{!i.is_read&&<span className="h-2 w-2 rounded-full bg-primary" aria-label="Não lida"/>}<Badge variant={i.severity==='error'?'destructive':'outline'} className="text-[10px]">{severityLabel}</Badge><Badge variant="outline" className="text-[10px]">{meta.label}</Badge></div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{i.message}</p><p className="mt-1.5 text-xs text-muted-foreground/70">{formatDistanceToNow(new Date(i.occurred_at),{addSuffix:true,locale:ptBR})}</p></div></button>})}</div>}
  </div>;
}
