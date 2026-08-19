import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, RefreshCw, Search, Webhook } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

type Subscription = { clinica_id:string; clinica_nome:string; dono_email:string|null; assinatura_id:string|null; assinatura_status:string|null; em_trial:boolean|null; data_fim:string|null; trial_fim:string|null; plano_nome:string|null; plano_valor:number|null; mp_status:string|null; proximo_pagamento:string|null; mp_preapproval_id:string|null; vencida:boolean };
type WebhookLog = { id:string; event_id:string|null; event_type:string; data_id:string|null; processado:boolean|null; tentativas:number|null; erro_mensagem:string|null; created_at:string };
type Overview = { generated_at:string; metrics:{mrr:number;ativas:number;trials:number;vencidas:number;sem_assinatura:number;webhooks_pendentes:number;webhooks_falha_24h:number}; subscriptions:Subscription[]; webhooks:WebhookLog[] };
const moeda=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function PlatformCobrancas(){
  const [busca,setBusca]=useState(''); const [status,setStatus]=useState('all');
  const overview=useQuery({queryKey:['platform-billing-overview'],queryFn:async()=>{const{data,error}=await(supabase as any).rpc('platform_billing_overview');if(error)throw error;return data as Overview},refetchInterval:60_000});
  const lista=useMemo(()=>{const termo=busca.trim().toLowerCase();return(overview.data?.subscriptions||[]).filter(s=>(!termo||`${s.clinica_nome} ${s.dono_email||''} ${s.plano_nome||''}`.toLowerCase().includes(termo))&&(status==='all'||(status==='vencida'?s.vencida:status==='sem_assinatura'?!s.assinatura_id:s.assinatura_status===status)))},[busca,status,overview.data]);
  const m=overview.data?.metrics;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><CreditCard/>Cobranças da Plataforma</h1><p className="text-muted-foreground">Assinaturas, vencimentos e processamento do Mercado Pago.</p></div><Button variant="outline" onClick={()=>overview.refetch()}><RefreshCw className={`mr-2 h-4 w-4 ${overview.isFetching?'animate-spin':''}`}/>Atualizar</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['MRR',moeda(m?.mrr||0)],['Assinaturas ativas',m?.ativas||0],['Vencidas',m?.vencidas||0],['Sem assinatura',m?.sem_assinatura||0]].map(([l,v])=><Card key={l}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{v}</p></CardContent></Card>)}</div>
    {(m?.webhooks_pendentes||m?.webhooks_falha_24h)?<Card className="border-destructive/40"><CardContent className="flex items-center gap-3 pt-6"><AlertTriangle className="h-6 w-6 text-destructive"/><div><p className="font-medium">Processamento financeiro requer atenção</p><p className="text-sm text-muted-foreground">{m.webhooks_pendentes} pendente(s) · {m.webhooks_falha_24h} falha(s) nas últimas 24h</p></div></CardContent></Card>:null}
    <Card><CardHeader><CardTitle>Carteira de clientes</CardTitle><CardDescription>Estado local e vínculo com a assinatura do Mercado Pago.</CardDescription></CardHeader><CardContent className="space-y-3">
      <div className="flex flex-wrap gap-2"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar clínica, responsável ou plano" className="pl-9"/></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44" aria-label="Filtrar assinatura"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="ativa">Ativas</SelectItem><SelectItem value="trial">Trial</SelectItem><SelectItem value="cancelada">Canceladas</SelectItem><SelectItem value="vencida">Vencidas</SelectItem><SelectItem value="sem_assinatura">Sem assinatura</SelectItem></SelectContent></Select></div>
      {lista.map(s=><div key={s.clinica_id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-6 md:items-center"><div className="md:col-span-2"><p className="font-medium">{s.clinica_nome}</p><p className="text-xs text-muted-foreground">{s.dono_email||'Sem e-mail do responsável'}</p></div><span className="text-sm">{s.plano_nome||'Sem plano'}<small className="block text-muted-foreground">{moeda(s.plano_valor||0)}/mês</small></span><Badge variant={s.vencida?'destructive':'outline'}>{s.vencida?'vencida':s.assinatura_status||'sem assinatura'}</Badge><span className="text-xs">MP: {s.mp_status||'não vinculado'}</span><span className="text-xs text-muted-foreground">Próxima: {s.proximo_pagamento?new Date(s.proximo_pagamento).toLocaleDateString('pt-BR'):'—'}</span></div>)}
      {!lista.length&&<p className="py-6 text-center text-sm text-muted-foreground">Nenhuma assinatura corresponde aos filtros.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5"/>Webhooks recentes</CardTitle><CardDescription>Metadados seguros; payloads financeiros não são expostos.</CardDescription></CardHeader><CardContent className="space-y-2">{(overview.data?.webhooks||[]).slice(0,30).map(w=><div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="text-sm font-medium">{w.event_type}</p><p className="text-xs text-muted-foreground">Evento {w.event_id||w.data_id||'sem identificador'} · {new Date(w.created_at).toLocaleString('pt-BR')}</p>{w.erro_mensagem&&<p className="text-xs text-destructive">{w.erro_mensagem}</p>}</div><div className="flex gap-2"><Badge variant="secondary">{w.tentativas||0} tentativa(s)</Badge><Badge variant={w.processado?'outline':'destructive'}>{w.processado?'processado':'pendente'}</Badge></div></div>)}{!overview.data?.webhooks.length&&<p className="py-4 text-center text-sm text-muted-foreground">Nenhum webhook registrado.</p>}</CardContent></Card>
  </div>;
}
