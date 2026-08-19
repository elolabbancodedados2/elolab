import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, CreditCard, Mail, PlugZap, RefreshCw, Search, Webhook } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

type State={configured:boolean;healthy:boolean;status?:string;total?:number;last_activity?:string|null};
type Clinic={clinica_id:string;clinica_nome:string;ativo:boolean;whatsapp:State;email:State;apis:State;ia:State;pagamentos:State};
type Overview={generated_at:string;clinics:Clinic[]};
const services=[['WhatsApp','whatsapp',PlugZap],['E-mail','email',Mail],['APIs/webhooks','apis',Webhook],['IA','ia',Bot],['Pagamentos','pagamentos',CreditCard]] as const;
const last=(value?:string|null)=>value?new Date(value).toLocaleString('pt-BR'):'Sem atividade registrada';

export default function PlatformIntegracoes(){
  const [search,setSearch]=useState('');
  const query=useQuery({queryKey:['platform-clinic-integrations'],queryFn:async()=>{const{data,error}=await(supabase as any).rpc('platform_clinic_integration_overview');if(error)throw error;return data as Overview},refetchInterval:60_000});
  const clinics=useMemo(()=>{const term=search.trim().toLowerCase();return(query.data?.clinics||[]).filter(c=>!term||c.clinica_nome.toLowerCase().includes(term))},[query.data,search]);
  const unhealthy=(query.data?.clinics||[]).reduce((sum,c)=>sum+services.filter(([,key])=>c[key].configured&&!c[key].healthy).length,0);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><PlugZap/>Integrações por Clínica</h1><p className="text-muted-foreground">Inventário e saúde operacional sem exposição de chaves, URLs ou payloads.</p></div><Button variant="outline" onClick={()=>query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching?'animate-spin':''}`}/>Atualizar diagnóstico</Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Clínicas monitoradas</p><p className="text-2xl font-bold">{query.data?.clinics.length||0}</p></CardContent></Card><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Alertas de integração</p><p className="text-2xl font-bold text-destructive">{unhealthy}</p></CardContent></Card><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Última leitura</p><p className="text-sm font-semibold">{last(query.data?.generated_at)}</p></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Diagnóstico consolidado</CardTitle><CardDescription>“Sem uso” significa que ainda não existe evidência operacional; não é marcado como falha.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar clínica" aria-label="Buscar clínica"/></div>
      {clinics.map(c=><section key={c.clinica_id} className="rounded-lg border p-4" aria-label={`Integrações de ${c.clinica_nome}`}><div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold">{c.clinica_nome}</h2><Badge variant={c.ativo?'outline':'secondary'}>{c.ativo?'ativa':'inativa'}</Badge></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{services.map(([label,key,Icon])=>{const state=c[key];return <div key={key} className="rounded-md bg-muted/50 p-3"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="h-4 w-4"/>{label}</span><Badge variant={!state.configured?'secondary':state.healthy?'outline':'destructive'}>{!state.configured?'não configurado':state.healthy?'operacional':'atenção'}</Badge></div><p className="mt-2 truncate text-xs text-muted-foreground">{state.status||`${state.total||0} cadastrada(s)`}</p><p className="mt-1 text-[11px] text-muted-foreground">{last(state.last_activity)}</p></div>})}</div></section>)}
      {!query.isLoading&&!clinics.length&&<p className="py-8 text-center text-sm text-muted-foreground">Nenhuma clínica encontrada.</p>}
    </CardContent></Card>
  </div>;
}
