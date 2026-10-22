import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Globe, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';

type DomainPurpose = 'app' | 'email';
type DomainStatus = 'pending' | 'verified' | 'error';
type DnsChecks = { a?: boolean; mx?: boolean; spf?: boolean; dmarc?: boolean };
type PlatformDomain = {
  id: string;
  domain: string;
  purpose: DomainPurpose;
  status: DomainStatus;
  checked_at: string | null;
  dns_result: DnsChecks | null;
};

const domainPattern = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const statusLabels: Record<DomainStatus, string> = { pending: 'Aguardando verificação', verified: 'Verificado', error: 'DNS incompleto' };
const dnsLabels: Record<keyof DnsChecks, string> = { a: 'A', mx: 'MX', spf: 'SPF', dmarc: 'DMARC' };

function dateTime(value: string | null) {
  if (!value) return 'Ainda não verificado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

function normalizeDomain(input: string) {
  const withoutProtocol = input.trim().toLowerCase().replace(/^https?:\/\//, '');
  return withoutProtocol.endsWith('/') ? withoutProtocol.slice(0, -1) : withoutProtocol;
}

export default function PlatformDominios() {
  const queryClient = useQueryClient();
  const addLock = useRef(false);
  const [domainInput, setDomainInput] = useState('');
  const [purpose, setPurpose] = useState<DomainPurpose>('app');
  const [statusFilter, setStatusFilter] = useState<DomainStatus | 'all'>('all');
  const normalizedDomain = normalizeDomain(domainInput);
  const domainValid = domainPattern.test(normalizedDomain);

  const domains = useQuery({
    queryKey: ['platform-domains'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('platform_domains').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as PlatformDomain[];
    },
  });

  const addDomain = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('platform_domains').insert({ domain: normalizedDomain, purpose });
      if (error) throw error;
    },
    onSuccess: () => {
      setDomainInput('');
      toast.success('Domínio adicionado. Verifique os registros DNS antes de usá-lo.');
      void queryClient.invalidateQueries({ queryKey: ['platform-domains'] });
    },
    onError: (error: any) => toast.error(
      error?.code === '23505' ? 'Este domínio já está cadastrado.' : 'Não foi possível adicionar o domínio.',
      { description: error?.code === '23505' ? 'Cada host pode ter apenas uma finalidade cadastrada.' : mensagemDeErro(error) },
    ),
    onSettled: () => { addLock.current = false; },
  });

  const checkDns = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('platform-check-domain', { body: { id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { verified: boolean; result: DnsChecks };
    },
    onSuccess: (result) => {
      toast[result.verified ? 'success' : 'warning'](
        result.verified ? 'Os registros necessários foram encontrados.' : 'Ainda faltam registros DNS para esta finalidade.',
      );
      void queryClient.invalidateQueries({ queryKey: ['platform-domains'] });
    },
    onError: (error) => toast.error('Falha ao consultar o DNS.', { description: mensagemDeErro(error) }),
  });

  const submitDomain = () => {
    if (!domainValid || addLock.current) return;
    addLock.current = true;
    addDomain.mutate();
  };

  const all = domains.data ?? [];
  const count = (status: DomainStatus) => all.filter((item) => item.status === status).length;
  const visible = statusFilter === 'all' ? all : all.filter((item) => item.status === statusFilter);
  const kpis = [
    { key: 'all' as const, label: 'Domínios cadastrados', value: all.length, icon: Globe, cls: '' },
    { key: 'verified' as const, label: 'Verificados', value: count('verified'), icon: CheckCircle2, cls: 'bg-success/10 text-success' },
    { key: 'pending' as const, label: 'Aguardando verificação', value: count('pending'), icon: Clock, cls: 'bg-warning/10 text-warning' },
    { key: 'error' as const, label: 'DNS incompleto', value: count('error'), icon: ShieldAlert, cls: 'bg-destructive/10 text-destructive' },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="Domínios e DNS"
        icon={<Globe />}
        description={domains.data
          ? `${all.length} domínios · ${count('verified')} verificados · ${count('error')} com DNS incompleto`
          : 'Consulte registros públicos antes de configurar domínios da aplicação ou do e-mail.'}
        actions={
          <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Atualizar dados" onClick={() => void domains.refetch()} disabled={domains.isFetching}>
            <RefreshCw className={cn('h-4 w-4', domains.isFetching && 'animate-spin')} />
          </Button>
        }
      />

      {domains.data && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicadores de domínios">
          {kpis.map(({ key, label, value, icon: Icon, cls }) => {
            const main = key === 'all';
            return (
              <button
                key={key}
                type="button"
                aria-pressed={statusFilter === key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'rounded-2xl border p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  main ? 'border-transparent bg-gradient-primary text-white' : 'border-border/60 bg-card',
                  statusFilter === key && !main && 'ring-2 ring-[#1080CA]/40',
                )}
              >
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', main ? 'bg-white/20 text-white' : cls)}><Icon className="h-5 w-5" /></span>
                <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
                <p className={cn('text-[11px]', main ? 'text-white/75' : 'text-muted-foreground')}>{label}</p>
              </button>
            );
          })}
        </section>
      )}

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle>Adicionar domínio</CardTitle>
          <CardDescription>Informe apenas o host, como clinica.com.br. Cada host pode ser cadastrado uma vez. A verificação consulta DNS público; ela não configura o domínio no provedor.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[minmax(16rem,2fr)_minmax(10rem,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="platform-domain">Domínio</Label>
            <Input id="platform-domain" className="h-10 rounded-full font-mono focus-visible:ring-[#1080CA]" value={domainInput} onChange={(event) => setDomainInput(event.target.value)} placeholder="clinica.com.br" autoCapitalize="none" autoCorrect="off" disabled={addDomain.isPending} />
            {domainInput.trim() && !domainValid && <p role="alert" className="text-xs text-destructive">Digite um domínio válido, sem porta, caminho ou parâmetros.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain-purpose">Finalidade</Label>
            <Select value={purpose} onValueChange={(value) => setPurpose(value as DomainPurpose)} disabled={addDomain.isPending}>
              <SelectTrigger id="domain-purpose" className="h-10 rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="app">Aplicação</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="min-h-10 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={submitDomain} disabled={!domainValid || addDomain.isPending}>
            {addDomain.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adicionar domínio
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Domínios cadastrados</CardTitle>
            <CardDescription>Para aplicação, o registro A é obrigatório. Para e-mail, são obrigatórios MX e SPF. DMARC é exibido como recomendação.</CardDescription>
          </div>
          {domains.data && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {statusFilter !== 'all' && <Button variant="outline" size="sm" className="rounded-full" onClick={() => setStatusFilter('all')}>Limpar filtros</Button>}
              <span>{visible.length} de {all.length}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {domains.isLoading ? (
            [1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full rounded-xl" />)
          ) : domains.isError ? (
            <div role="alert" className="rounded-xl border border-destructive/30 p-4">
              <p className="font-medium">Não foi possível carregar os domínios.</p>
              <p className="mt-1 text-sm text-muted-foreground">{mensagemDeErro(domains.error)}</p>
              <Button className="mt-3 rounded-full" variant="outline" onClick={() => void domains.refetch()}>Tentar novamente</Button>
            </div>
          ) : all.length && !visible.length ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">Nenhum domínio neste status.</p>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setStatusFilter('all')}>Limpar filtros</Button>
            </div>
          ) : visible.length ? (
            visible.map((item) => {
              const checks = item.dns_result;
              const required = item.purpose === 'app' ? ['a'] as const : ['mx', 'spf'] as const;
              return (
                <article key={item.id} className="rounded-xl border border-border/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-all font-mono font-semibold">{item.domain}</h2>
                        <Badge variant="outline" className="rounded-full border-[#BFD8EE] text-[#1080CA]">{item.purpose === 'app' ? 'Aplicação' : 'E-mail'}</Badge>
                        <Badge variant={item.status === 'error' ? 'destructive' : 'secondary'} className={cn('rounded-full', item.status === 'verified' && 'border-transparent bg-success/15 text-success')}>
                          {statusLabels[item.status] || item.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Última consulta: {dateTime(item.checked_at)}</p>
                      <div className="mt-3 flex flex-wrap gap-2" aria-label="Resultado dos registros DNS">
                        {(Object.keys(dnsLabels) as Array<keyof DnsChecks>).map((key) => {
                          const requiredRecord = (required as readonly string[]).includes(key);
                          const relevantRecord = requiredRecord || (key === 'dmarc' && item.purpose === 'email');
                          const exists = checks?.[key] === true;
                          const unknown = checks?.[key] === undefined;
                          return <Badge key={key} className="rounded-full" variant={unknown || !relevantRecord ? 'secondary' : exists ? 'outline' : requiredRecord ? 'destructive' : 'secondary'}>
                            {dnsLabels[key]}: {unknown ? 'não consultado' : exists ? 'encontrado' : requiredRecord ? 'ausente' : relevantRecord ? 'recomendado' : 'não necessário'}
                          </Badge>;
                        })}
                      </div>
                    </div>
                    <Button className="h-9 shrink-0 rounded-full text-xs" variant="outline" onClick={() => checkDns.mutate(item.id)} disabled={checkDns.isPending}>
                      {checkDns.isPending && checkDns.variables === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Verificar DNS
                    </Button>
                  </div>
                  {item.status === 'verified' ? (
                    <p className="mt-3 flex items-center gap-2 text-xs text-success"><CheckCircle2 className="h-4 w-4" /> Registros obrigatórios encontrados; a configuração no provedor ainda precisa ser feita separadamente.</p>
                  ) : item.status === 'error' && checks && (
                    <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><ShieldAlert className="h-4 w-4" /> Corrija os registros necessários e consulte novamente.</p>
                  )}
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-[#BFD8EE] p-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><Globe className="h-6 w-6" /></span>
              <p className="mt-3 font-medium text-foreground">Nenhum domínio cadastrado</p>
              <p className="mt-1 text-sm text-muted-foreground">Adicione um domínio para consultar seus registros DNS.</p>
              <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => document.getElementById('platform-domain')?.focus()}>Adicionar domínio</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
