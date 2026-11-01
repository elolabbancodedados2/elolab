import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { alteracoesGrade, chaveCelula, type AlteracaoGrade, type PrecoGravado } from '@/lib/gradePrecosConsulta';

interface Props {
  tipos: ReadonlyArray<{ id: string; nome: string; valor_particular: number; ativo: boolean }>;
  convenios: ReadonlyArray<{ id: string; nome: string }>;
  precos: ReadonlyArray<PrecoGravado>;
  podeEditar: boolean;
  onSalvar: (alteracoes: AlteracaoGrade[]) => Promise<{ falhas: number }>;
  onDirtyChange?: (dirty: boolean) => void;
}

const valorTexto = (valor: number | undefined) => valor === undefined ? '' : valor.toFixed(2).replace('.', ',');
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

/** Preços de todos os tipos de consulta em todos os convênios ativos, editáveis de uma vez. */
export function GradePrecosConsulta({ tipos, convenios, precos, podeEditar, onSalvar, onDirtyChange }: Props) {
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const precoDe = (tipoId: string, convenioId: string) => precos.find(p => p.tipo_consulta_id === tipoId && p.convenio_id === convenioId)?.valor;
  const { alteracoes, invalidas } = alteracoesGrade(edicoes, precos);
  const dirty = alteracoes.length > 0 || invalidas.length > 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  async function salvar() {
    if (salvando || alteracoes.length === 0) return;
    if (invalidas.length) { toast.error('Corrija as células destacadas: use valores com até duas casas decimais.'); return; }
    setSalvando(true);
    try {
      const { falhas } = await onSalvar(alteracoes);
      if (!falhas) setEdicoes({});
    } finally { setSalvando(false); }
  }

  if (tipos.length === 0 || convenios.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Cadastre tipos de consulta e convênios ativos para montar a grade.</p>;
  }

  return <div className="space-y-3">
    {!podeEditar && <p role="status" className="text-sm text-muted-foreground">Somente leitura: apenas administradores alteram preços.</p>}
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <Table>
        <TableHeader><TableRow>
          <TableHead className="sticky left-0 min-w-40 bg-card">Tipo</TableHead>
          <TableHead className="text-right">Particular</TableHead>
          {convenios.map(c => <TableHead key={c.id} className="min-w-32 text-right">{c.nome}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{tipos.map(t => <TableRow key={t.id} className={cn(!t.ativo && 'text-muted-foreground')}>
          <TableCell className="sticky left-0 bg-card font-medium">{t.nome}{!t.ativo && <span className="block text-xs">Inativo</span>}</TableCell>
          <TableCell className="text-right tabular-nums">{brl(t.valor_particular)}</TableCell>
          {convenios.map(c => {
            const chave = chaveCelula(t.id, c.id);
            const gravado = precoDe(t.id, c.id);
            const texto = edicoes[chave] ?? valorTexto(gravado);
            const alterada = edicoes[chave] !== undefined && edicoes[chave] !== valorTexto(gravado);
            return <TableCell key={c.id} className="text-right">
              {podeEditar
                ? <Input inputMode="decimal" aria-label={`Preço de ${t.nome} no ${c.nome}`} value={texto} placeholder="—" disabled={salvando}
                    aria-invalid={invalidas.includes(chave)}
                    onChange={e => setEdicoes(atual => ({ ...atual, [chave]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Escape') setEdicoes(atual => { const proximo = { ...atual }; delete proximo[chave]; return proximo; }); }}
                    className={cn('ml-auto h-11 w-28 text-right tabular-nums', alterada && 'border-foreground', invalidas.includes(chave) && 'border-destructive')} />
                : <span className="tabular-nums">{gravado === undefined ? '—' : brl(gravado)}</span>}
            </TableCell>;
          })}
        </TableRow>)}</TableBody>
      </Table>
    </div>
    {podeEditar && <div className="flex flex-wrap items-center justify-end gap-2">
      <p className="mr-auto text-xs text-muted-foreground">Esc desfaz a célula. Para remover um preço, use a tela de preços do tipo.</p>
      <Button variant="outline" className="min-h-11" disabled={!dirty || salvando} onClick={() => setEdicoes({})}>Descartar</Button>
      <Button className="min-h-11" disabled={alteracoes.length === 0 || salvando} onClick={() => void salvar()}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar alterações ({alteracoes.length})</Button>
    </div>}
  </div>;
}
