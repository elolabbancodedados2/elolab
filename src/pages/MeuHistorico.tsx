import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { History, LockKeyhole, SearchX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

type Action = 'create'|'update'|'delete'|'access'|'sign'|'edit_request';
interface HistoryEvent { event_id:string; action:Action; resource:string; occurred_at:string; total_count:number }
const PAGE_SIZE=20;
const actions:Record<Action,string>={create:'Criou',update:'Atualizou',delete:'Excluiu',access:'Acessou',sign:'Assinou',edit_request:'Solicitou edição'};
const resources:Record<string,string>={pacientes:'Paciente',agendamentos:'Agendamento',prontuarios:'Prontuário',prescricoes:'Prescrição',atestados:'Atestado',exames:'Exame',tarefas:'Tarefa',contas_receber:'Conta a receber',contas_pagar:'Conta a pagar',support_access:'Acesso de suporte'};
const resourceLabel=(value:string)=>resources[value]??value.split('_').join(' ').replace(/^./,l=>l.toUpperCase());

export default function MeuHistorico(){
 const {user,clinicaId}=useSupabaseAuth(); const[action,setAction]=useState('all'); const[resource,setResource]=useState('all');
 const[from,setFrom]=useState(''); const[to,setTo]=useState(''); const[page,setPage]=useState(1);
 const history=useQuery({queryKey:['meu-historico',user?.id,clinicaId,action,resource,from,to,page],enabled:Boolean(user&&clinicaId),queryFn:async()=>{
  const{data,error}=await(supabase as any).rpc('meu_historico_acoes',{p_action:action==='all'?null:action,p_collection:resource==='all'?null:resource,p_from:from?`${from}T00:00:00`:null,p_to:to?`${to}T23:59:59.999`:null,p_page:page,p_page_size:PAGE_SIZE}); if(error)throw error; return(data??[])as HistoryEvent[];
 }});
 const events=history.data??[]; const total=Number(events[0]?.total_count??0); const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
 const filter=(setter:(v:string)=>void,value:string)=>{setter(value);setPage(1)};
 return <main className="space-y-6 p-2 sm:p-6" aria-labelledby="history-title">
  <header><h1 id="history-title" className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl"><History className="h-7 w-7 text-primary" aria-hidden="true"/>Meu histórico</h1><p className="mt-1 text-muted-foreground">Consulte as ações realizadas pela sua conta nesta clínica.</p></header>
  <Card className="border-primary/15 bg-primary/[0.03]"><CardContent className="flex gap-3 p-4 text-sm"><LockKeyhole className="h-5 w-5 shrink-0 text-primary" aria-hidden="true"/><p>Este histórico é pessoal. Nomes de pacientes, conteúdo alterado e identificadores de registros não são exibidos.</p></CardContent></Card>
  <Card><CardHeader><CardTitle>Filtros</CardTitle><CardDescription>Refine por ação, recurso ou período.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <div className="space-y-2"><Label htmlFor="history-action">Ação</Label><Select value={action} onValueChange={v=>filter(setAction,v)}><SelectTrigger id="history-action" aria-label="Filtrar por ação"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{Object.entries(actions).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
   <div className="space-y-2"><Label htmlFor="history-resource">Recurso</Label><Input id="history-resource" value={resource==='all'?'':resource} placeholder="Todos" onChange={e=>filter(setResource,e.target.value.trim()||'all')}/></div>
   <div className="space-y-2"><Label htmlFor="history-from">De</Label><Input id="history-from" type="date" value={from} max={to||undefined} onChange={e=>filter(setFrom,e.target.value)}/></div>
   <div className="space-y-2"><Label htmlFor="history-to">Até</Label><Input id="history-to" type="date" value={to} min={from||undefined} onChange={e=>filter(setTo,e.target.value)}/></div>
  </CardContent></Card>
  {history.isPending?<section className="space-y-3" aria-label="Carregando histórico" aria-busy="true">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-20 w-full rounded-xl"/>)}</section>:history.isError?<ErrorState title="Não foi possível carregar seu histórico" error={history.error} onRetry={()=>history.refetch()}/>:events.length===0?<Card><CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 text-center"><SearchX className="h-10 w-10 text-muted-foreground" aria-hidden="true"/><div><h2 className="font-semibold">Nenhuma ação encontrada</h2><p className="text-sm text-muted-foreground">Ajuste os filtros ou volte mais tarde.</p></div></CardContent></Card>:<section className="space-y-3" aria-label="Ações da sua conta"><p className="text-sm text-muted-foreground" aria-live="polite">{total} {total===1?'ação encontrada':'ações encontradas'}</p><ol className="space-y-3">{events.map(e=><li key={e.event_id}><Card><CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-3"><Badge variant="secondary">{actions[e.action]}</Badge><span className="truncate font-medium">{resourceLabel(e.resource)}</span></div><time className="shrink-0 text-sm text-muted-foreground" dateTime={e.occurred_at}>{format(new Date(e.occurred_at),"dd 'de' MMM 'de' yyyy, HH:mm",{locale:ptBR})}</time></CardContent></Card></li>)}</ol><nav className="flex flex-col items-center justify-between gap-3 pt-2 sm:flex-row" aria-label="Páginas do histórico"><p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p><div className="flex gap-2"><Button variant="outline" disabled={page===1||history.isFetching} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</Button><Button variant="outline" disabled={page>=totalPages||history.isFetching} onClick={()=>setPage(p=>p+1)}>Próxima</Button></div></nav></section>}
 </main>
}
