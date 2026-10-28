import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bot, Building2, Clock, CreditCard, Mail, PlugZap, RefreshCw, Search, Webhook } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { supabase } from '@/integrations/supabase/client';

type State={configured:boolean;healthy:boolean;status?:string;total?:number;last_activity?:string|null};
type Clinic={clinica_id:string;clinica_nome:string;ativo:boolean;whatsapp:State;email:State;apis:State;ia:State;pagamentos:State};
type Overview={generated_at:string;clinics:Clinic[]};
const services=[['WhatsApp','whatsapp',PlugZap],['E-mail','email',Mail],['APIs/webhooks','apis',Webhook],['IA','ia',Bot],['Pagamentos','pagamentos',CreditCard]] as const;
const last=(value?:string|null)=>{if(!value)return'Sem atividade registrada';const date=new Date(value);return Number.isNaN(date.getTime())?'Data indisponível':date.toLocaleString('pt-BR')};
const statusLabel=(value?:string)=>{
  const normalized=(value||'').trim().toLocaleLowerCase('pt-BR');
  const labels:Record<string,string>={
    connected:'conectado',conectado:'conectado',open:'conectado',close:'desconectado',
    desconectado:'desconectado',ativo:'ativo',active:'ativo',inativo:'inativo',inactive:'inativo',
    'não configurado':'não configurado','nao configurado':'não configurado',
    'não vinculado':'não vinculado','nao vinculado':'não vinculado',
    operacional:'operacional','falha recente':'falha recente','sem uso':'sem uso',erro:'erro',
  };
  return labels[normalized] || value || '';
};

function badgeFor(state: State) {
  if (state.status === 'sem uso') return { label: 'sem uso', variant: 'secondary' as const };
  if (!state.configured) return { label: 'não configurado', variant: 'secondary' as const };
  if (state.healthy) return { label: 'operacional', variant: 'outline' as const };
  return { label: 'atenção', variant: 'destructive' as const };
}

const alertsOf=(c:Clinic)=>services.filter(([,key])=>c[key].configured&&!c[key].healthy).length;

export default function PlatformIntegracoes(){
  const [search,setSearch]=useState('');
  const [onlyAlerts,setOnlyAlerts]=useState(false);
  const query=useQuery({queryKey:['platform-clinic-integrations'],queryFn:async()=>{const{data,error}=await(supabase as any).rpc('platform_clinic_integration_overview');if(error)throw error;return data as Overview},refetchInterval:60_000});
  const clinics=useMemo(()=>{const term=search.trim().toLowerCase();return(query.data?.clinics||[]).filter(c=>(!term||c.clinica_nome.toLowerCase().includes(term))&&(!onlyAlerts||alertsOf(c)>0))},[query.data,search,onlyAlerts]);
  const total=query.data?.clinics.length ?? 0;
  const unhealthy=(query.data?.clinics||[]).reduce((sum,c)=>sum+alertsOf(c),0);
  const clinicsWithAlerts=(query.data?.clinics||[]).filter(c=>alertsOf(c)>0).length;
  const filtered=Boolean(search.trim())||onlyAlerts;
  return <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
    <PageHeader
      title="Integrações por Clínica"
      icon={<PlugZap />}
      description={query.data ? `${total} clínicas monitoradas · ${unhealthy} alertas em ${clinicsWithAlerts} clínicas. Status registrado, sem exposição de chaves, URLs ou payloads; esta tela não testa as credenciais nos provedores.` : 'Inventário de status e atividade registrados, sem exposição de chaves, URLs ou payloads. Esta tela não testa as credenciais nos provedores.'}
      actions={<Button type="button" variant="outline" size="icon" className="rounded-full" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Atualizar dados"><RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>}
    />

    {query.isLoading ? (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[1, 2, 3].map(item => <Skeleton key={item} className="h-28 rounded-2xl" />)}</div>
    ) : query.isError ? (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    ) : <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="Indicadores de integrações">
        <button type="button" aria-pressed={!onlyAlerts} onClick={() => setOnlyAlerts(false)} className="rounded-2xl border border-transparent bg-gradient-primary p-4 text-left text-white shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><Building2 className="h-5 w-5" /></span>
          <p className="mt-2 text-2xl font-bold tabular-nums">{total}</p><p className="text-[11px] text-white/75">Clínicas monitoradas</p>
        </button>
        <button type="button" aria-pressed={onlyAlerts} onClick={() => setOnlyAlerts(true)} className={cn('rounded-2xl border bg-card p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', unhealthy ? 'border-destructive/40' : 'border-border/60', onlyAlerts && 'ring-2 ring-[#1080CA]/40')}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="h-5 w-5" /></span>
          <p className={cn('mt-2 text-2xl font-bold tabular-nums', unhealthy > 0 && 'text-destructive')}>{unhealthy}</p><p className="text-[11px] text-muted-foreground">Alertas de integração</p>
        </button>
        <div className="col-span-2 rounded-2xl border border-border/60 bg-card p-4 shadow-xs md:col-span-1">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1080CA]/10 text-[#1080CA]"><Clock className="h-5 w-5" /></span>
          <p className="mt-2 text-sm font-semibold">{last(query.data?.generated_at)}</p><p className="text-[11px] text-muted-foreground">Dados consolidados em</p>
        </div>
      </section>

      <Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><CardTitle>Status por clínica</CardTitle><CardDescription>O status reflete o último registro disponível no EloLab, não uma verificação ao vivo. “Sem uso” indica falta de evidência operacional e não conta como falha.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar clínica" aria-label="Buscar clínica" /></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={onlyAlerts} onClick={() => setOnlyAlerts(v => !v)} className={cn('h-8 rounded-full border px-3 text-xs font-medium transition-colors', onlyAlerts ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-[#DCE6F2] bg-card hover:border-[#9CC7EC]')}>Somente com alerta</button>
            {filtered && <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setSearch(''); setOnlyAlerts(false); }}>Limpar filtros</Button>}
            <p className="text-xs text-muted-foreground" aria-live="polite">{clinics.length} de {total} clínicas</p>
          </div>
        </div>
        {clinics.map(clinic => <section key={clinic.clinica_id} className={cn('rounded-xl border border-border/60 p-4', alertsOf(clinic) > 0 && 'border-destructive/30')} aria-label={`Integrações de ${clinic.clinica_nome}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="min-w-0 truncate font-semibold">{clinic.clinica_nome}</h2><div className="flex items-center gap-2"><Badge variant={clinic.ativo ? 'outline' : 'secondary'} className="rounded-full">{clinic.ativo ? 'ativa' : 'inativa'}</Badge><Button asChild variant="outline" size="sm" className="h-8 rounded-full text-xs"><Link to={`/admin/crm?busca=${encodeURIComponent(clinic.clinica_nome)}`}>Ver cliente</Link></Button></div></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{services.map(([label, key, Icon]) => {
            const state = clinic[key];
            const badge = badgeFor(state);
            return <div key={key} className="rounded-xl bg-[#F3F8FC] p-3"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="h-4 w-4 text-[#1080CA]" />{label}</span><Badge variant={badge.variant} className="rounded-full">{badge.label}</Badge></div><p className="mt-2 truncate text-xs text-muted-foreground">{state.status ? `Último estado: ${statusLabel(state.status)}` : `${state.total || 0} cadastrada(s)`}</p><p className="mt-1 text-[11px] text-muted-foreground">{last(state.last_activity)}</p></div>;
          })}</div>
        </section>)}
        {!clinics.length && <div className="flex flex-col items-center gap-2 py-8 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><PlugZap className="h-6 w-6" /></span><p className="text-sm text-muted-foreground">{search.trim() ? 'Nenhuma clínica corresponde à busca.' : onlyAlerts ? 'Nenhuma clínica com alerta de integração.' : 'Nenhuma clínica cadastrada para monitorar.'}</p>{filtered && <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setSearch(''); setOnlyAlerts(false); }}>Limpar busca</Button>}</div>}
      </CardContent></Card>
    </>}
  </main>;
}
