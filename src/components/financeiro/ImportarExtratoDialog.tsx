import { useId, useMemo, useState } from 'react';
import { FileUp, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buscarEmBlocos } from '@/lib/buscarEmBlocos';
import { lerOfx, previaImportacaoExtrato, type LancamentoConferencia, type SituacaoLinhaExtrato, type TransacaoExtrato } from '@/lib/extratoBancario';
import { cn } from '@/lib/utils';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const LIMITE_ARQUIVO = 5 * 1024 * 1024;
const SITUACAO: Record<SituacaoLinhaExtrato, { label: string; className: string }> = {
  nova: { label: 'Nova', className: 'border-[#BFD8EE] text-[#1080CA]' },
  ja_importada: { label: 'Já importada', className: 'border-border text-muted-foreground' },
  repetida_no_arquivo: { label: 'Repetida no arquivo', className: 'border-warning/40 text-warning-foreground' },
};

export function ImportarExtratoDialog({ clinicaId, lancamentos }: { clinicaId: string; lancamentos: ReadonlyArray<LancamentoConferencia> }) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [extrato, setExtrato] = useState<{ conta: string; transacoes: TransacaoExtrato[]; jaImportados: Set<string> } | null>(null);
  const [processando, setProcessando] = useState(false);
  const previa = useMemo(() => extrato ? previaImportacaoExtrato(extrato.transacoes, extrato.jaImportados, lancamentos) : [], [extrato, lancamentos]);
  const novas = previa.filter(l => l.situacao === 'nova');

  async function ler(arquivo: File | undefined) {
    setExtrato(null);
    if (!arquivo) return;
    if (arquivo.size > LIMITE_ARQUIVO) return toast.error('O arquivo deve ter no máximo 5 MB.');
    setProcessando(true);
    try {
      const { conta, transacoes } = lerOfx(await arquivo.text());
      const existentes = await buscarEmBlocos<{ fitid: string }>(() => supabase.from('extrato_bancario_transacoes')
        .select('fitid').eq('clinica_id', clinicaId).eq('conta', conta).order('id', { ascending: true }));
      setExtrato({ conta, transacoes, jaImportados: new Set(existentes.map(e => e.fitid)) });
    } catch (error: any) {
      toast.error('Não foi possível ler o extrato.', { description: error?.message });
    } finally { setProcessando(false); }
  }

  async function registrar() {
    if (!extrato || novas.length === 0) return;
    setProcessando(true);
    try {
      const { data, error } = await supabase.rpc('importar_extrato_bancario', {
        p_conta: extrato.conta,
        p_transacoes: novas.map(({ fitid, data, valor, descricao }) => ({ fitid, data, valor, descricao })),
      });
      if (error) throw error;
      const r = data as { importadas: number; repetidas: number };
      toast.success(`${r.importadas} transação(ões) registrada(s); ${r.repetidas} já existia(m) e foi(ram) ignorada(s).`, { description: 'Nenhum lançamento foi criado. Confira as correspondências nas contas.' });
      setAberto(false);
      setExtrato(null);
    } catch (error: any) {
      toast.error('Não foi possível registrar o extrato.', { description: error?.message });
    } finally { setProcessando(false); }
  }

  return <>
    <Button variant="outline" className="shrink-0 gap-2 rounded-full" onClick={() => setAberto(true)}><FileUp className="h-4 w-4" />Importar extrato</Button>
    <Dialog open={aberto} onOpenChange={open => { if (!processando) { setAberto(open); if (!open) setExtrato(null); } }}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar extrato bancário</DialogTitle>
          <DialogDescription>Envie o arquivo OFX do banco. Transações já importadas ou repetidas são ignoradas, e nenhuma conta é lançada automaticamente: a prévia mostra os lançamentos existentes com mesmo valor, sentido e data próxima (até 3 dias).</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-arquivo`}>Arquivo OFX</Label>
          <Input id={`${id}-arquivo`} type="file" accept=".ofx,application/x-ofx,text/plain" disabled={processando} onChange={e => { void ler(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {extrato && <>
          <p role="status" className="text-sm text-muted-foreground">Conta {extrato.conta} · {previa.length} transação(ões): {novas.length} nova(s), {previa.filter(l => l.situacao === 'ja_importada').length} já importada(s), {previa.filter(l => l.situacao === 'repetida_no_arquivo').length} repetida(s) no arquivo · {previa.filter(l => l.correspondencias.length > 0).length} com correspondência.</p>
          <div className="overflow-x-auto rounded-xl border border-border/60"><Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Situação</TableHead><TableHead>Correspondência</TableHead></TableRow></TableHeader>
            <TableBody>{previa.map((l, i) => <TableRow key={`${l.fitid}-${i}`}>
              <TableCell className="whitespace-nowrap">{l.data.split('-').reverse().join('/')}</TableCell>
              <TableCell>{l.descricao || '—'}</TableCell>
              <TableCell className={cn('text-right tabular-nums', l.valor < 0 ? 'text-destructive' : 'text-success')}>{brl(l.valor)}</TableCell>
              <TableCell><Badge variant="outline" className={cn('rounded-full', SITUACAO[l.situacao].className)}>{SITUACAO[l.situacao].label}</Badge></TableCell>
              <TableCell className="text-xs">{l.correspondencias.length === 0 ? <span className="text-warning-foreground">Sem correspondência</span> : l.correspondencias.map(c => `${c.descricao || 'Lançamento'} (${c.status})`).join('; ')}</TableCell>
            </TableRow>)}</TableBody>
          </Table></div>
        </>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={processando}>Cancelar</Button>
          <Button className="rounded-full bg-gradient-primary text-white hover:brightness-110" onClick={() => void registrar()} disabled={processando || novas.length === 0}>{processando && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}Registrar {novas.length} transação(ões) nova(s)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
