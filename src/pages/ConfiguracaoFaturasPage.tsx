import { ArrowLeft, Receipt } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/formatters';
import { descreverEventoCobranca, type EventoCobrancaAssinatura } from '@/lib/subscriptionBillingHistory';

function formatarValor(valor: number | null) {
  if (valor === null || !Number.isFinite(Number(valor))) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor));
}

function dataEvento(valor: string | null) {
  if (!valor) return 'Data indisponível';
  const date = new Date(valor);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : formatDate(date, 'short');
}

export default function ConfiguracaoFaturasPage() {
  const { user } = useSupabaseAuth();
  const { data: faturas, isLoading, error, refetch } = useQuery({
    queryKey: ['historico_cobranca_assinatura', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<EventoCobrancaAssinatura[]> => {
      const { data, error: queryError } = await supabase.rpc('historico_cobranca_assinatura', { p_limit: 50 });
      if (queryError) throw queryError;
      return (data || []) as EventoCobrancaAssinatura[];
    },
  });

  return <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader
      title="Histórico de faturas"
      description="Acompanhe as cobranças da assinatura EloLab e o estado mais recente de cada uma."
      icon={<Receipt />}
      actions={<Button variant="outline" asChild><Link to="/configuracoes?tab=plano"><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao plano</Link></Button>}
    />

    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cobranças da assinatura</CardTitle>
        <CardDescription>Até 50 eventos recentes. Recebimentos e cobranças de pacientes ficam no módulo Financeiro.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3" role="status" aria-busy="true" aria-label="Carregando histórico de faturas">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
          </div>
        ) : error ? (
          <ErrorState title="Não foi possível carregar as faturas" error={error} onRetry={() => void refetch()} />
        ) : !faturas?.length ? (
          <p role="status" className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma fatura encontrada ainda.</p>
        ) : <>
          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faturas.map((fatura) => {
                  const evento = descreverEventoCobranca(fatura);
                  return <TableRow key={`${fatura.origem}-${fatura.id}`}>
                    <TableCell className="whitespace-nowrap text-xs">{dataEvento(fatura.criado_em)}</TableCell>
                    <TableCell className="text-xs">{evento.tipo}{evento.detalhe && <span className="block text-muted-foreground">{evento.detalhe}</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs font-semibold">{formatarValor(fatura.valor)}</TableCell>
                    <TableCell><Badge variant={evento.final ? 'outline' : 'secondary'}>{evento.estado}{evento.final ? '' : ' · em andamento'}</Badge></TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y sm:hidden" aria-label="Cobranças recentes da assinatura">
            {faturas.map((fatura) => {
              const evento = descreverEventoCobranca(fatura);
              return <li key={`${fatura.origem}-${fatura.id}`} className="space-y-2 py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{evento.tipo}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{dataEvento(fatura.criado_em)}{evento.detalhe ? ` · ${evento.detalhe}` : ''}</p>
                  </div>
                  <Badge className="shrink-0" variant={evento.final ? 'outline' : 'secondary'}>{evento.estado}{evento.final ? '' : ' · em andamento'}</Badge>
                </div>
                <p className="text-sm font-semibold">{formatarValor(fatura.valor)}</p>
              </li>;
            })}
          </ul>
        </>}
      </CardContent>
    </Card>
  </div>;
}
