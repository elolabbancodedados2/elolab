import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

const REQUEST_STATUSES = ['pending', 'fulfilled', 'denied'] as const;

const STATUS_LABELS: Record<(typeof REQUEST_STATUSES)[number], string> = {
  pending: 'Pendente',
  fulfilled: 'Atendida',
  denied: 'Negada',
};

export default function PlatformLGPD() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [categoria, setCategoria] = useState('');
  const [meses, setMeses] = useState('60');
  const [baseLegal, setBaseLegal] = useState('');

  const casos = useQuery({
    queryKey: ['platform-lgpd-cases'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lgpd_access_request_log')
        .select('*')
        .order('requested_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const politicas = useQuery({
    queryKey: ['platform-retention'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('platform_retention_policies')
        .select('*')
        .order('categoria');
      if (error) throw error;
      return data || [];
    },
  });

  const atualizarStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any)
      .from('lgpd_access_request_log')
      .update({
        status,
        fulfillment_date: status === 'fulfilled' ? new Date().toISOString() : null,
        responsavel_id: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      toast.error(mensagemDeErro(error));
      return;
    }

    toast.success('Solicitação atualizada');
    queryClient.invalidateQueries({ queryKey: ['platform-lgpd-cases'] });
  };

  const criarPolitica = async () => {
    const { error } = await (supabase as any).from('platform_retention_policies').insert({
      categoria,
      retencao_meses: Number(meses),
      base_legal: baseLegal,
      updated_by: user?.id,
    });

    if (error) {
      toast.error(mensagemDeErro(error));
      return;
    }

    toast.success('Política de retenção adicionada');
    setCategoria('');
    setBaseLegal('');
    queryClient.invalidateQueries({ queryKey: ['platform-retention'] });
  };

  const pendentes = casos.data?.filter((caso: any) => caso.status === 'pending').length || 0;
  const vencidos =
    casos.data?.filter(
      (caso: any) =>
        caso.status === 'pending' && caso.prazo_em && new Date(caso.prazo_em) < new Date(),
    ).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck />
          LGPD e Conformidade
        </h1>
        <p className="text-muted-foreground">
          Prazos, direitos dos titulares e retenção sem expor conteúdo clínico.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Solicitações', casos.data?.length || 0],
          ['Pendentes', pendentes],
          ['Prazo vencido', vencidos],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solicitações de titulares</CardTitle>
          <CardDescription>
            Identificadores técnicos; dados de saúde permanecem na clínica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {casos.data?.map((caso: any) => {
            const vencido =
              caso.status === 'pending' &&
              caso.prazo_em &&
              new Date(caso.prazo_em) < new Date();

            return (
              <div
                key={caso.id}
                className="grid gap-2 rounded-lg border p-3 md:grid-cols-5 md:items-center"
              >
                <div>
                  <b>{caso.request_type}</b>
                  <p className="text-xs text-muted-foreground">Clínica {caso.clinica_id}</p>
                </div>
                <Badge variant={vencido ? 'destructive' : 'outline'}>
                  <Clock className="mr-1 h-3 w-3" />
                  {caso.prazo_em
                    ? new Date(caso.prazo_em).toLocaleDateString('pt-BR')
                    : 'Sem prazo'}
                </Badge>
                <span className="text-xs">Titular {String(caso.paciente_id).slice(0, 8)}…</span>
                <Select value={caso.status} onValueChange={(value) => atualizarStatus(caso.id, value)}>
                  <SelectTrigger aria-label="Status da solicitação">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUEST_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {caso.base_legal || 'Base legal pendente'}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Políticas de retenção</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-52"
              value={categoria}
              onChange={(event) => setCategoria(event.target.value)}
              placeholder="Categoria"
              aria-label="Categoria da política"
            />
            <Input
              className="max-w-32"
              type="number"
              min="1"
              value={meses}
              onChange={(event) => setMeses(event.target.value)}
              placeholder="Meses"
              aria-label="Prazo de retenção em meses"
            />
            <Input
              className="max-w-md"
              value={baseLegal}
              onChange={(event) => setBaseLegal(event.target.value)}
              placeholder="Base legal"
              aria-label="Base legal da política"
            />
            <Button
              onClick={criarPolitica}
              disabled={!categoria.trim() || !baseLegal.trim() || Number(meses) < 1}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar
            </Button>
          </div>

          {politicas.data?.map((politica: any) => (
            <div key={politica.id} className="flex justify-between rounded-lg border p-3">
              <div>
                <b>{politica.categoria}</b>
                <p className="text-xs text-muted-foreground">{politica.base_legal}</p>
              </div>
              <Badge>{politica.retencao_meses} meses</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
