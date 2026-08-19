import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, Search, ServerCrash } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type ClientError = {
  id: string;
  clinica_id: string | null;
  tipo: string;
  mensagem: string;
  origem: string | null;
  rota: string | null;
  release: string | null;
  fingerprint: string | null;
  status: 'open' | 'resolved' | 'ignored';
  created_at: string;
};

type AutomationError = {
  id: string;
  clinica_id: string | null;
  tipo: string;
  nome: string;
  status: string;
  erro_mensagem: string | null;
  created_at: string;
};

const statusLabel = { open: 'Aberto', resolved: 'Resolvido', ignored: 'Ignorado' };

export default function PlatformErros() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('open');

  const errosCliente = useQuery({
    queryKey: ['platform-client-errors'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_error_events')
        .select('id,clinica_id,tipo,mensagem,origem,rota,release,fingerprint,status,created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as ClientError[];
    },
  });

  const errosAutomacao = useQuery({
    queryKey: ['platform-automation-errors'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('automation_logs')
        .select('id,clinica_id,tipo,nome,status,erro_mensagem,created_at')
        .in('status', ['erro', 'parcial'])
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as AutomationError[];
    },
  });

  const grupos = useMemo(() => {
    const agrupados = new Map<string, ClientError[]>();
    for (const erro of errosCliente.data || []) {
      if (filtro !== 'all' && erro.status !== filtro) continue;
      const termo = busca.trim().toLowerCase();
      if (termo && !`${erro.mensagem} ${erro.rota || ''} ${erro.tipo}`.toLowerCase().includes(termo)) continue;
      const chave = erro.fingerprint || `${erro.tipo}:${erro.mensagem}:${erro.rota || ''}`;
      agrupados.set(chave, [...(agrupados.get(chave) || []), erro]);
    }
    return [...agrupados.values()].sort(
      (a, b) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime(),
    );
  }, [busca, errosCliente.data, filtro]);

  const atualizarGrupo = async (grupo: ClientError[], status: 'resolved' | 'ignored') => {
    const ids = grupo.map((erro) => erro.id);
    const { error } = await (supabase as any)
      .from('client_error_events')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id,
        resolution_note: status === 'ignored' ? 'Ignorado pela administração da plataforma' : 'Resolvido pela administração da plataforma',
      })
      .in('id', ids);
    if (error) return toast.error(mensagemDeErro(error));
    toast.success(`${ids.length} ocorrência(s) atualizada(s)`);
    queryClient.invalidateQueries({ queryKey: ['platform-client-errors'] });
  };

  const atualizar = () => {
    errosCliente.refetch();
    errosAutomacao.refetch();
  };

  const abertos = errosCliente.data?.filter((erro) => erro.status === 'open').length || 0;
  const ultimas24h = errosCliente.data?.filter(
    (erro) => Date.now() - new Date(erro.created_at).getTime() < 86_400_000,
  ).length || 0;
  const falhasAutomacao = errosAutomacao.data?.filter(
    (erro) => Date.now() - new Date(erro.created_at).getTime() < 86_400_000,
  ).length || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ServerCrash /> Logs e Erros</h1>
          <p className="text-muted-foreground">Incidentes reais do frontend e das automações da plataforma.</p>
        </div>
        <Button variant="outline" onClick={atualizar}>
          <RefreshCw className={`mr-2 h-4 w-4 ${(errosCliente.isFetching || errosAutomacao.isFetching) ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Erros abertos', abertos],
          ['Frontend nas últimas 24h', ultimas24h],
          ['Automações nas últimas 24h', falhasAutomacao],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Erros do aplicativo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar mensagem, rota ou tipo" className="pl-9" />
            </div>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-44" aria-label="Filtrar status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Abertos</SelectItem>
                <SelectItem value="resolved">Resolvidos</SelectItem>
                <SelectItem value="ignored">Ignorados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {grupos.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum erro corresponde aos filtros.</p> : grupos.map((grupo) => {
            const erro = grupo[0];
            return (
              <div key={erro.fingerprint || erro.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={erro.status === 'open' ? 'destructive' : 'outline'}>{statusLabel[erro.status]}</Badge>
                      <Badge variant="secondary">{grupo.length} ocorrência(s)</Badge>
                      <span className="text-xs text-muted-foreground">{erro.tipo}</span>
                    </div>
                    <p className="mt-2 break-words text-sm font-medium">{erro.mensagem}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{erro.rota || 'Rota desconhecida'} · {new Date(erro.created_at).toLocaleString('pt-BR')} · release {erro.release || 'não informada'}</p>
                  </div>
                  {erro.status === 'open' && <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => atualizarGrupo(grupo, 'ignored')}>Ignorar</Button>
                    <Button size="sm" onClick={() => atualizarGrupo(grupo, 'resolved')}><CheckCircle2 className="mr-1 h-4 w-4" />Resolver</Button>
                  </div>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Falhas de automação recentes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(errosAutomacao.data || []).slice(0, 30).map((erro) => (
            <div key={erro.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div><p className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-destructive" />{erro.nome}</p><p className="text-xs text-muted-foreground">{erro.erro_mensagem || 'Execução parcial sem mensagem'} · {new Date(erro.created_at).toLocaleString('pt-BR')}</p></div>
              <Badge variant={erro.status === 'erro' ? 'destructive' : 'outline'}>{erro.status}</Badge>
            </div>
          ))}
          {!errosAutomacao.data?.length && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma falha de automação registrada.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
