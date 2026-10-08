import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Globe, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

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

  return (
    <div className="space-y-6 pb-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Globe className="h-6 w-6 text-primary" /> Domínios e DNS</h1>
        <p className="mt-1 text-sm text-muted-foreground">Consulte registros públicos antes de configurar domínios da aplicação ou do e-mail.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Adicionar domínio</CardTitle>
          <CardDescription>Informe apenas o host, como clinica.com.br. Cada host pode ser cadastrado uma vez. A verificação consulta DNS público; ela não configura o domínio no provedor.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[minmax(16rem,2fr)_minmax(10rem,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="platform-domain">Domínio</Label>
            <Input id="platform-domain" className="font-mono" value={domainInput} onChange={(event) => setDomainInput(event.target.value)} placeholder="clinica.com.br" autoCapitalize="none" autoCorrect="off" disabled={addDomain.isPending} />
            {domainInput.trim() && !domainValid && <p role="alert" className="text-xs text-destructive">Digite um domínio válido, sem porta, caminho ou parâmetros.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain-purpose">Finalidade</Label>
            <Select value={purpose} onValueChange={(value) => setPurpose(value as DomainPurpose)} disabled={addDomain.isPending}>
              <SelectTrigger id="domain-purpose"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="app">Aplicação</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="min-h-11" onClick={submitDomain} disabled={!domainValid || addDomain.isPending}>
            {addDomain.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adicionar domínio
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domínios cadastrados</CardTitle>
          <CardDescription>Para aplicação, o registro A é obrigatório. Para e-mail, são obrigatórios MX e SPF. DMARC é exibido como recomendação.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {domains.isLoading ? (
            [1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full" />)
          ) : domains.isError ? (
            <div role="alert" className="rounded-lg border border-destructive/30 p-4">
              <p className="font-medium">Não foi possível carregar os domínios.</p>
              <p className="mt-1 text-sm text-muted-foreground">{mensagemDeErro(domains.error)}</p>
              <Button className="mt-3" variant="outline" onClick={() => void domains.refetch()}>Tentar novamente</Button>
            </div>
          ) : domains.data?.length ? (
            domains.data.map((item) => {
              const checks = item.dns_result;
              const required = item.purpose === 'app' ? ['a'] as const : ['mx', 'spf'] as const;
              return (
                <article key={item.id} className="rounded-xl border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-all font-mono font-semibold">{item.domain}</h2>
                        <Badge variant="outline">{item.purpose === 'app' ? 'Aplicação' : 'E-mail'}</Badge>
                        <Badge variant={item.status === 'verified' ? 'default' : item.status === 'error' ? 'destructive' : 'secondary'}>
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
                          return <Badge key={key} variant={unknown || !relevantRecord ? 'secondary' : exists ? 'outline' : requiredRecord ? 'destructive' : 'secondary'}>
                            {dnsLabels[key]}: {unknown ? 'não consultado' : exists ? 'encontrado' : requiredRecord ? 'ausente' : relevantRecord ? 'recomendado' : 'não necessário'}
                          </Badge>;
                        })}
                      </div>
                    </div>
                    <Button className="min-h-11 shrink-0" variant="outline" onClick={() => checkDns.mutate(item.id)} disabled={checkDns.isPending}>
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
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Globe className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 font-medium">Nenhum domínio cadastrado</p>
              <p className="mt-1 text-sm text-muted-foreground">Adicione um domínio para consultar seus registros DNS.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
