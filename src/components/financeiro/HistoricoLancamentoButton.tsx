import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CAMPOS_TRILHA, formatarValorTrilha } from '@/lib/trilhaLancamento';

interface Props {
  lancamentoId: string;
  descricao: string | null;
  rotulos?: Record<string, string>;
}

/** Trilha de vencimento, valor, categoria e centro de custo de uma conta. */
export function HistoricoLancamentoButton({ lancamentoId, descricao, rotulos }: Props) {
  const [aberto, setAberto] = useState(false);
  const historico = useQuery({
    queryKey: ['historico-lancamento', lancamentoId],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('historico_alteracoes_lancamento', { p_lancamento_id: lancamentoId });
      if (error) throw error;
      return data ?? [];
    },
  });
  const nome = descricao || 'lançamento';

  return <>
    <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10" onClick={() => setAberto(true)} aria-label={`Histórico de alterações de ${nome}`} title="Histórico de alterações">
      <History className="h-4 w-4" />
    </Button>
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico de alterações</DialogTitle>
          <DialogDescription>{nome} · vencimento, valor, categoria e centro de custo, com autor e data.</DialogDescription>
        </DialogHeader>
        {historico.isLoading ? <p className="text-sm text-muted-foreground">Carregando histórico…</p>
          : historico.isError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar o histórico. {(historico.error as Error)?.message}</p>
          : (historico.data?.length ?? 0) === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma alteração desses campos foi registrada.</p>
          : <div className="overflow-x-auto rounded-xl border border-border/60"><Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Usuário</TableHead><TableHead>Campo</TableHead><TableHead>Antes</TableHead><TableHead>Depois</TableHead></TableRow></TableHeader>
            <TableBody>{historico.data!.map((h, i) => <TableRow key={`${h.alterado_em}-${h.campo}-${i}`}>
              <TableCell className="whitespace-nowrap">{new Date(h.alterado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</TableCell>
              <TableCell>{h.alterado_por_nome || 'Sistema'}</TableCell>
              <TableCell>{CAMPOS_TRILHA[h.campo] ?? h.campo}</TableCell>
              <TableCell className="tabular-nums">{formatarValorTrilha(h.campo, h.valor_anterior, rotulos)}</TableCell>
              <TableCell className="tabular-nums">{formatarValorTrilha(h.campo, h.valor_novo, rotulos)}</TableCell>
            </TableRow>)}</TableBody>
          </Table></div>}
      </DialogContent>
    </Dialog>
  </>;
}
