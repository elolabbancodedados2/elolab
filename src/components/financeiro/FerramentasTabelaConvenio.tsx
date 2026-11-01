import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmBlocos } from '@/lib/buscarEmBlocos';
import { mensagemDeErro } from '@/lib/erros';
import { executarEmSequencia } from '@/lib/glosaLote';
import {
  itensCopiados, lerCsvTabela, previaMesclagem, previaReajuste, resumoPrevia,
  type ErroImportacao, type ItemExistente, type ItemTabela, type LinhaPrevia,
} from '@/lib/tabelaPrecosConvenio';

export type FerramentaTabela = 'importar' | 'reajustar' | 'copiar';

interface Props {
  ferramenta: FerramentaTabela | null;
  convenioId: string;
  clinicaId: string;
  existentes: ReadonlyArray<ItemExistente>;
  outrosConvenios: ReadonlyArray<{ id: string; nome: string }>;
  onOpenChange: (aberto: boolean) => void;
  onConcluido: () => void;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const TITULOS: Record<FerramentaTabela, string> = {
  importar: 'Importar tabela de preços',
  reajustar: 'Reajustar tabela',
  copiar: 'Copiar tabela de outro convênio',
};

/** Importar CSV, reajustar por percentual ou copiar de outro convênio, sempre com prévia antes de gravar. */
export function FerramentasTabelaConvenio({ ferramenta, convenioId, clinicaId, existentes, outrosConvenios, onOpenChange, onConcluido }: Props) {
  const [importados, setImportados] = useState<ItemTabela[]>([]);
  const [errosImportacao, setErrosImportacao] = useState<ErroImportacao[]>([]);
  const [percentual, setPercentual] = useState('');
  const [origemId, setOrigemId] = useState('');
  const [fator, setFator] = useState('1');
  const [origem, setOrigem] = useState<ItemTabela[] | null>(null);
  const [carregandoOrigem, setCarregandoOrigem] = useState(false);
  const [gravando, setGravando] = useState(false);

  const limpar = () => { setImportados([]); setErrosImportacao([]); setPercentual(''); setOrigemId(''); setFator('1'); setOrigem(null); };
  const fechar = (aberto: boolean) => { if (gravando) return; if (!aberto) limpar(); onOpenChange(aberto); };

  const percentualNumero = Number(percentual.replace(',', '.'));
  const fatorNumero = Number(fator.replace(',', '.'));
  const previa: LinhaPrevia[] = useMemo(() => {
    if (ferramenta === 'importar') return previaMesclagem(importados, existentes);
    if (ferramenta === 'reajustar') return percentual.trim() && Number.isFinite(percentualNumero) && percentualNumero > -100 ? previaReajuste(existentes, percentualNumero) : [];
    if (ferramenta === 'copiar') return origem && Number.isFinite(fatorNumero) && fatorNumero > 0 ? previaMesclagem(itensCopiados(origem, fatorNumero), existentes) : [];
    return [];
  }, [ferramenta, importados, existentes, percentual, percentualNumero, origem, fatorNumero]);
  const resumo = resumoPrevia(previa);
  const alteracoes = previa.filter(l => l.acao !== 'manter');

  async function lerArquivo(arquivo?: File) {
    if (!arquivo) return;
    if (!/\.(csv|txt)$/i.test(arquivo.name)) { toast.error('Envie um arquivo CSV. No Excel, use "Salvar como" > CSV.'); return; }
    if (arquivo.size > 2 * 1024 * 1024) { toast.error('O arquivo deve ter até 2 MB.'); return; }
    const { itens, erros } = lerCsvTabela(await arquivo.text());
    setImportados(itens);
    setErrosImportacao(erros);
  }

  async function carregarOrigem(id: string) {
    setOrigemId(id);
    setOrigem(null);
    setCarregandoOrigem(true);
    try {
      const linhas = await buscarEmBlocos<ItemTabela>(() => supabase.from('precos_exames_convenio')
        .select('tipo_exame,codigo_tuss,descricao,valor_tabela,valor_filme,valor_custo,valor_repasse')
        .eq('convenio_id', id).eq('clinica_id', clinicaId).order('tipo_exame').order('id'));
      setOrigem(linhas);
    } catch (error) {
      toast.error('Não foi possível ler a tabela de origem.', { description: mensagemDeErro(error) });
    } finally { setCarregandoOrigem(false); }
  }

  async function aplicar() {
    if (gravando || alteracoes.length === 0) return;
    setGravando(true);
    try {
      const novos = alteracoes.filter(l => l.acao === 'inserir').map(l => ({ ...l.item, convenio_id: convenioId, clinica_id: clinicaId }));
      if (novos.length) {
        const { error } = await supabase.from('precos_exames_convenio').insert(novos);
        if (error) throw error;
      }
      const resultado = await executarEmSequencia(alteracoes.filter(l => l.acao === 'atualizar').map(l => l.id!), async id => {
        const linha = alteracoes.find(l => l.id === id)!;
        const { data, error } = await supabase.from('precos_exames_convenio').update(linha.item)
          .eq('id', id).eq('convenio_id', convenioId).eq('clinica_id', clinicaId).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Item não encontrado ou sem permissão.');
      });
      onConcluido();
      if (resultado.falhas.length) {
        toast.error(`${resultado.falhas.length} item(ns) não foram atualizados.`, { description: mensagemDeErro(resultado.falhas[0].erro) });
      } else {
        toast.success(`Tabela atualizada: ${novos.length} incluído(s), ${resultado.concluidas.length} alterado(s).`);
        limpar();
        onOpenChange(false);
      }
    } catch (error) {
      toast.error('Não foi possível gravar a tabela.', { description: mensagemDeErro(error) });
    } finally { setGravando(false); }
  }

  return <Dialog open={!!ferramenta} onOpenChange={fechar}>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      {ferramenta && <>
        <DialogHeader>
          <DialogTitle>{TITULOS[ferramenta]}</DialogTitle>
          <DialogDescription>Confira a prévia antes de gravar. Exames com o mesmo nome são atualizados; os demais são incluídos.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={gravando} className="space-y-4">
          {ferramenta === 'importar' && <div className="space-y-2">
            <Label htmlFor="tabela-importar-arquivo">Arquivo CSV</Label>
            <Input id="tabela-importar-arquivo" type="file" accept=".csv,text/csv,text/plain" className="min-h-11" onChange={e => { void lerArquivo(e.target.files?.[0]); e.target.value = ''; }} />
            <p className="text-xs text-muted-foreground">Colunas: exame, tuss, descricao, valor, filme, custo, repasse. Separador ";" ou ",". Planilhas do Excel podem ser salvas como CSV.</p>
            {errosImportacao.length > 0 && <ul role="alert" className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{errosImportacao.map(e => <li key={`${e.linha}-${e.mensagem}`}>Linha {e.linha}: {e.mensagem}</li>)}</ul>}
          </div>}
          {ferramenta === 'reajustar' && <div className="max-w-xs space-y-2">
            <Label htmlFor="tabela-reajuste-percentual">Reajuste (%)</Label>
            <Input id="tabela-reajuste-percentual" inputMode="decimal" placeholder="Ex.: 5 ou -3" value={percentual} onChange={e => setPercentual(e.target.value)} className="min-h-11" />
            <p className="text-xs text-muted-foreground">Vale para valor de tabela e filme. Custo e repasse não mudam.</p>
          </div>}
          {ferramenta === 'copiar' && <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="tabela-copiar-origem">Copiar de</Label><Select value={origemId} onValueChange={id => void carregarOrigem(id)}><SelectTrigger id="tabela-copiar-origem" className="min-h-11"><SelectValue placeholder="Escolha o convênio" /></SelectTrigger><SelectContent>{outrosConvenios.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="tabela-copiar-fator">Fator sobre os valores</Label><Input id="tabela-copiar-fator" inputMode="decimal" value={fator} onChange={e => setFator(e.target.value)} className="min-h-11" /><p className="text-xs text-muted-foreground">1 copia igual; 0,9 fica 10% abaixo; 1,1 fica 10% acima.</p></div>
            {carregandoOrigem && <p role="status" className="text-sm text-muted-foreground sm:col-span-2">Lendo a tabela de origem…</p>}
            {origem && origem.length === 0 && <p role="status" className="text-sm text-muted-foreground sm:col-span-2">O convênio escolhido não tem exames na tabela.</p>}
          </div>}
        </fieldset>
        {previa.length > 0 && <section aria-label="Prévia" className="space-y-2">
          <p role="status" className="text-sm">{resumo.inserir} a incluir · {resumo.atualizar} a alterar · {resumo.manter} sem mudança</p>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border/60 text-sm">
            {alteracoes.slice(0, 200).map(l => <li key={`${l.acao}-${l.item.tipo_exame}`} className="flex items-center justify-between gap-3 p-2">
              <span className="min-w-0 truncate">{l.item.tipo_exame}<span className="block text-xs text-muted-foreground">{l.acao === 'inserir' ? 'Novo' : 'Alterado'}</span></span>
              <span className="shrink-0 tabular-nums">{l.valorAnterior !== undefined && <span className="mr-1 text-xs text-muted-foreground line-through">{brl(l.valorAnterior)}</span>}{brl(l.item.valor_tabela)}</span>
            </li>)}
          </ul>
          {alteracoes.length > 200 && <p className="text-xs text-muted-foreground">Mostrando 200 de {alteracoes.length} alterações; todas serão gravadas.</p>}
        </section>}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => fechar(false)} disabled={gravando}>Cancelar</Button>
          <Button className="min-h-11" onClick={() => void aplicar()} disabled={gravando || alteracoes.length === 0}>{gravando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gravar {alteracoes.length} alteraç{alteracoes.length === 1 ? 'ão' : 'ões'}</Button>
        </DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}
