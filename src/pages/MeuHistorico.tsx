import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { History, LockKeyhole, RefreshCw, Search, SearchX, Shield, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type Action = 'create'|'update'|'delete'|'access'|'sign'|'edit_request';
interface HistoryEvent { event_id:string; action:Action; resource:string; occurred_at:string; total_count:number }
const PAGE_SIZE=20;
const actions:Record<Action,string>={create:'Criou',update:'Atualizou',delete:'Excluiu',access:'Acessou',sign:'Assinou',edit_request:'Solicitou edição'};
const resources:Record<string,string>={pacientes:'Paciente',agendamentos:'Agendamento',prontuarios:'Prontuário',prescricoes:'Prescrição',atestados:'Atestado',exames:'Exame',tarefas:'Tarefa',contas_receber:'Conta a receber',contas_pagar:'Conta a pagar',support_access:'Acesso de suporte'};
const actionTone:Record<Action,string>={create:'border-success/40 bg-success/10 text-success',update:'border-border bg-[#F3F8FC] text-primary',delete:'border-destructive/40 bg-destructive/10 text-destructive',access:'border-border bg-muted text-muted-foreground',sign:'border-info/40 bg-info/10 text-info',edit_request:'border-warning/40 bg-warning/10 text-warning'};
const resourceLabel=(value:string)=>resources[value]??value.split('_').join(' ').replace(/^./,l=>l.toUpperCase());

export default function MeuHistorico(){
 const {user,clinicaId}=useSupabaseAuth(); const[action,setAction]=useState('all'); const[resource,setResource]=useState('all');
 const[from,setFrom]=useState(''); const[to,setTo]=useState(''); const[page,setPage]=useState(1);
 const history=useQuery({queryKey:['meu-historico',user?.id,clinicaId,action,resource,from,to,page],enabled:Boolean(user&&clinicaId),queryFn:async()=>{
  const{data,error}=await(supabase as any).rpc('meu_historico_acoes',{p_action:action==='all'?null:action,p_collection:resource==='all'?null:resource,p_from:from?new Date(`${from}T00:00:00-03:00`).toISOString():null,p_to:to?new Date(`${to}T23:59:59.999-03:00`).toISOString():null,p_page:page,p_page_size:PAGE_SIZE}); if(error)throw error; return(data??[])as HistoryEvent[];
 }});
 const events=history.data??[]; const total=Number(events[0]?.total_count??0); const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
 useEffect(()=>{if(history.isSuccess&&!history.isFetching&&events.length===0&&page>1)setPage(current=>Math.max(1,current-1))},[history.isSuccess,history.isFetching,events.length,page]);
 const filter=(setter:(v:string)=>void,value:string)=>{setter(value);setPage(1)};
 const hasFilters=action!=='all'||resource!=='all'||Boolean(from)||Boolean(to);
 const clearFilters=()=>{setAction('all');setResource('all');setFrom('');setTo('');setPage(1)};
 return <main className="space-y-6 p-2 sm:p-6" aria-label="Meu histórico">
  <PageHeader title="Meu histórico" icon={<History/>}
   description={<>Consulte as ações realizadas pela sua conta nesta clínica.{history.isSuccess&&<> · {total} {total===1?'ação registrada':'ações registradas'}{hasFilters?' com os filtros atuais':''}</>}</>}
   actions={<><Button asChild variant="outline" className="rounded-full gap-2"><Link to="/seguranca"><Shield className="h-4 w-4"/>Segurança da conta</Link></Button><Button variant="outline" size="icon" className="rounded-full" aria-label="Atualizar histórico" disabled={history.isFetching} onClick={()=>history.refetch()}><RefreshCw className={`h-4 w-4 ${history.isFetching?'animate-spin':''}`}/></Button></>}/>
  <Card className="rounded-2xl border-border bg-[#F3F8FC] shadow-xs"><CardContent className="flex gap-3 p-4 text-sm"><LockKeyhole className="h-5 w-5 shrink-0 text-primary" aria-hidden="true"/><p>Este histórico é pessoal. Nomes de pacientes, conteúdo alterado e identificadores de registros não são exibidos.</p></CardContent></Card>
  <Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0"><div><CardTitle className="text-base">Filtros</CardTitle><CardDescription>Refine por ação, recurso ou período.</CardDescription></div>{hasFilters&&<Button variant="outline" size="sm" className="rounded-full gap-2" onClick={clearFilters}><X className="h-4 w-4"/>Limpar filtros</Button>}</CardHeader><CardContent className="space-y-4">
   <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por ação">{([['all','Todas'],...Object.entries(actions)] as [string,string][]).map(([v,l])=><button key={v} type="button" aria-pressed={action===v} onClick={()=>filter(setAction,v)} className={`h-8 rounded-full border px-3 text-xs transition ${action===v?'border-transparent bg-gradient-primary text-white shadow-sm':'border-[#DCE6F2] bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground'}`}>{l}</button>)}</div>
   <div className="grid gap-4 sm:grid-cols-3">
   <div className="space-y-2"><Label htmlFor="history-resource">Recurso</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/><Input id="history-resource" className="h-10 rounded-full pl-9 focus-visible:ring-primary" value={resource==='all'?'':resource} placeholder="Todos" onChange={e=>filter(setResource,e.target.value.trim()||'all')}/></div></div>
   <div className="space-y-2"><Label htmlFor="history-from">De</Label><Input id="history-from" type="date" className="h-10 rounded-full" value={from} max={to||undefined} onChange={e=>filter(setFrom,e.target.value)}/></div>
   <div className="space-y-2"><Label htmlFor="history-to">Até</Label><Input id="history-to" type="date" className="h-10 rounded-full" value={to} min={from||undefined} onChange={e=>filter(setTo,e.target.value)}/></div>
   </div>
  </CardContent></Card>
  {history.isPending?<section className="space-y-3" aria-label="Carregando histórico" aria-busy="true">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-20 w-full rounded-xl"/>)}</section>:history.isError?<ErrorState title="Não foi possível carregar seu histórico" error={history.error} onRetry={()=>history.refetch()}/>:events.length===0?<Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 text-center"><span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><SearchX className="h-7 w-7"/></span><div><h2 className="font-semibold text-foreground">Nenhuma ação encontrada</h2><p className="text-sm text-muted-foreground">{hasFilters?'Nenhuma ação corresponde aos filtros. Amplie o período ou limpe os filtros.':'Suas ações aparecem aqui conforme você usa a plataforma. Ajuste os filtros ou volte mais tarde.'}</p></div>{hasFilters&&<Button variant="outline" className="rounded-full gap-2" onClick={clearFilters}><X className="h-4 w-4"/>Limpar filtros</Button>}</CardContent></Card>:<section className="space-y-3" aria-label="Ações da sua conta"><p className="text-right text-sm text-muted-foreground" aria-live="polite">{total} {total===1?'ação encontrada':'ações encontradas'}</p><ol className="space-y-2">{events.map(e=><li key={e.event_id}><Card className="rounded-2xl border-border/60 shadow-xs transition hover:border-[#9CC7EC]"><CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-3"><Badge variant="outline" className={`shrink-0 rounded-full ${actionTone[e.action]??''}`}>{actions[e.action]}</Badge><span className="truncate font-medium">{resourceLabel(e.resource)}</span></div><time className="shrink-0 text-sm tabular-nums text-muted-foreground" dateTime={e.occurred_at}>{format(new Date(e.occurred_at),"dd 'de' MMM 'de' yyyy, HH:mm",{locale:ptBR})}</time></CardContent></Card></li>)}</ol><nav className="flex flex-col items-center justify-between gap-3 pt-2 sm:flex-row" aria-label="Páginas do histórico"><p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p><div className="flex gap-2"><Button variant="outline" className="rounded-full" disabled={page===1||history.isFetching} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</Button><Button variant="outline" className="rounded-full" disabled={page>=totalPages||history.isFetching} onClick={()=>setPage(p=>p+1)}>Próxima</Button></div></nav></section>}
 </main>
}
