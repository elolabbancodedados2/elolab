import { useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileUp, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MAX_LINHAS_AUTO, useLancamentos } from '@/hooks/useSupabaseData';
import { buscarEmBlocos } from '@/lib/buscarEmBlocos';
import { mensagemDeErro } from '@/lib/erros';
import { formatFinanceMonth, currentFinanceMonth, parseFinanceMonth } from '@/lib/financeRouteState';
import { lerOfx, previaImportacaoExtrato, type LancamentoConferencia, type SituacaoLinhaExtrato, type TransacaoExtrato } from '@/lib/extratoBancario';
import { cn } from '@/lib/utils';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const LIMITE_ARQUIVO = 5 * 1024 * 1024;
const LIMITE_IMPORTACAO = 5000;
const SITUACAO: Record<SituacaoLinhaExtrato, { label: string; className: string }> = {
  nova: { label: 'Nova', className: 'border-[#BFD8EE] bg-[#EAF2FF] text-[#1456C0]' },
  ja_importada: { label: 'Já importada', className: 'border-border bg-muted/50 text-muted-foreground' },
  repetida_no_arquivo: { label: 'Repetida no arquivo', className: 'border-warning/40 bg-warning/10 text-warning-foreground' },
};
const EMPTY_LANCAMENTOS: LancamentoConferencia[] = [];

interface ExtratoLido {
  conta: string;
  transacoes: TransacaoExtrato[];
  jaImportados: Set<string>;
  nomeArquivo: string;
}

export default function BankStatementImportPage() {
  const id = useId();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const lancamentosQuery = useLancamentos();
  const lancamentos = (lancamentosQuery.data as LancamentoConferencia[] | undefined) ?? EMPTY_LANCAMENTOS;
  const monthParam = new URLSearchParams(location.search).get('mes');
  const month = formatFinanceMonth(parseFinanceMonth(monthParam) ?? currentFinanceMonth());
  const returnTo = `/fluxo-caixa?mes=${month}`;
  const fileInput = useRef<HTMLInputElement>(null);
  const [extrato, setExtrato] = useState<ExtratoLido | null>(null);
  const [arquivoSelecionado, setArquivoSelecionado] = useState('');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  const previa = useMemo(() => extrato
    ? previaImportacaoExtrato(extrato.transacoes, extrato.jaImportados, lancamentos)
    : [], [extrato, lancamentos]);
  const novas = previa.filter(linha => linha.situacao === 'nova');
  const matches = previa.reduce((total, linha) => total + Number(linha.correspondencias.length > 0), 0);

  async function ler(arquivo: File | undefined) {
    setErro('');
    if (!arquivo) return;
    setArquivoSelecionado(arquivo.name);
    if (arquivo.size > LIMITE_ARQUIVO) {
      setErro('O arquivo deve ter no máximo 5 MB.');
      return;
    }
    setProcessando(true);
    try {
      const { conta, transacoes } = lerOfx(await arquivo.text());
      if (transacoes.length > LIMITE_IMPORTACAO) {
        throw new Error(`O arquivo contém ${transacoes.length.toLocaleString('pt-BR')} transações. O EloLab aceita até ${LIMITE_IMPORTACAO.toLocaleString('pt-BR')} por importação; gere um arquivo menor no banco.`);
      }
      const existentes = await buscarEmBlocos<{ fitid: string }>(() => supabase.from('extrato_bancario_transacoes')
        .select('fitid').eq('clinica_id', profile!.clinica_id!).eq('conta', conta).order('id', { ascending: true }));
      setExtrato({ conta, transacoes, jaImportados: new Set(existentes.map(item => item.fitid)), nomeArquivo: arquivo.name });
    } catch (error: unknown) {
      setErro(mensagemDeErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function registrar() {
    if (!extrato || novas.length === 0 || novas.length > LIMITE_IMPORTACAO) return;
    setProcessando(true);
    setErro('');
    try {
      const { data, error } = await supabase.rpc('importar_extrato_bancario', {
        p_conta: extrato.conta,
        p_transacoes: novas.map(({ fitid, data: dataTransacao, valor, descricao }) => ({ fitid, data: dataTransacao, valor, descricao })),
      });
      if (error) throw error;
      const resultado = data as { importadas: number; repetidas: number };
      toast.success(`${resultado.importadas} transação(ões) registrada(s); ${resultado.repetidas} já existia(m) e foi(ram) ignorada(s).`, {
        description: 'Nenhum lançamento foi criado. Confira as correspondências nas contas.',
      });
      navigate(returnTo, { replace: true });
    } catch (error: unknown) {
      setErro(mensagemDeErro(error));
    } finally {
      setProcessando(false);
    }
  }

  if (lancamentosQuery.isLoading) return <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded bg-muted" /><div className="h-72 animate-pulse rounded-xl bg-muted" /></div>;
  if (lancamentosQuery.isError) return <div className="mx-auto w-full max-w-5xl px-4 py-6"><ErrorState title="Não foi possível carregar as contas para conferência" error={lancamentosQuery.error} onRetry={() => void lancamentosQuery.refetch()} /></div>;
  if (!profile?.clinica_id) return <div className="mx-auto w-full max-w-5xl px-4 py-6"><ErrorState title="Clínica não identificada" description="Vincule seu usuário a uma clínica para importar o extrato bancário." /></div>;

  return <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader
      title="Importar extrato bancário"
      description="Leia um arquivo OFX, confira possíveis correspondências e escolha quais transações novas registrar."
      icon={<FileUp />}
      actions={<Button variant="outline" onClick={() => navigate(returnTo)} disabled={processando}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao fluxo de caixa</Button>}
    />

    {lancamentos.length >= MAX_LINHAS_AUTO && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>A lista de contas atingiu o limite de carregamento. As sugestões de correspondência podem estar incompletas; confira as contas antes de concluir.</p></div>}

    <Card>
      <CardHeader><CardTitle className="text-base">1. Selecione o arquivo</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor={`${id}-arquivo`}>Arquivo OFX</Label>
          <Input ref={fileInput} id={`${id}-arquivo`} className="sr-only" type="file" accept=".ofx,application/x-ofx,text/plain" disabled={processando} onChange={event => { void ler(event.target.files?.[0]); event.target.value = ''; }} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={processando} aria-label="Selecionar arquivo OFX" aria-describedby={`${id}-arquivo-help`}><FileUp className="mr-2 h-4 w-4" />Selecionar arquivo</Button>
            <span className="text-sm text-muted-foreground">{arquivoSelecionado || 'Nenhum arquivo selecionado'}</span>
          </div>
          <p id={`${id}-arquivo-help`} className="text-xs text-muted-foreground">Até 5 MB. Os dados do extrato são usados para conferência da clínica e não são enviados a terceiros.</p>
        </div>
        {erro && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{erro}</p>{extrato && <p className="mt-1 text-xs">A prévia atual foi preservada. Você pode tentar registrar novamente ou escolher outro arquivo.</p>}</div>}
      </CardContent>
    </Card>

    {extrato && <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><CardTitle className="text-base">2. Revise antes de registrar</CardTitle><p className="mt-1 text-sm text-muted-foreground">{extrato.nomeArquivo} · conta {extrato.conta}</p></div>
        <div className="flex flex-wrap gap-2" aria-label="Resumo do extrato">
          <Badge variant="outline">{previa.length} transações</Badge>
          <Badge variant="outline" className="border-[#BFD8EE] bg-[#EAF2FF] text-[#1456C0]">{novas.length} nova{novas.length === 1 ? '' : 's'}</Badge>
          <Badge variant="outline" className="border-border text-muted-foreground">{previa.filter(l => l.situacao === 'ja_importada').length} já importada{previa.filter(l => l.situacao === 'ja_importada').length === 1 ? '' : 's'}</Badge>
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground">{previa.filter(l => l.situacao === 'repetida_no_arquivo').length} repetida{previa.filter(l => l.situacao === 'repetida_no_arquivo').length === 1 ? '' : 's'}</Badge>
          <Badge variant="outline" className="border-[#A8D5B2] bg-[#EAF5EC] text-[#166534]">{matches} com correspondência</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role="status" className="text-sm text-muted-foreground">As correspondências são sugestões por valor, sentido e data próxima (até 3 dias). A importação não cria nem altera lançamentos.</p>
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Situação</TableHead><TableHead>Correspondência sugerida</TableHead></TableRow></TableHeader>
            <TableBody>{previa.map((linha, index) => <TableRow key={`${linha.fitid}-${index}`}>
              <TableCell className="whitespace-nowrap">{linha.data.split('-').reverse().join('/')}</TableCell>
              <TableCell className="min-w-40">{linha.descricao || '—'}</TableCell>
              <TableCell className={cn('whitespace-nowrap text-right tabular-nums', linha.valor < 0 ? 'text-destructive' : 'text-success')}>{brl(linha.valor)}</TableCell>
              <TableCell><Badge variant="outline" className={cn('whitespace-nowrap rounded-full', SITUACAO[linha.situacao].className)}>{SITUACAO[linha.situacao].label}</Badge></TableCell>
              <TableCell className="min-w-56 text-xs">{linha.correspondencias.length === 0
                ? <span className="text-muted-foreground">Sem correspondência</span>
                : linha.correspondencias.map(item => <p key={item.id}>{item.descricao || 'Lançamento'} · {item.status} · {brl(item.status === 'pago' || item.status === 'parcial' ? Number(item.valor_pago || 0) : Number(item.valor))}</p>)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => { setExtrato(null); setErro(''); }} disabled={processando}><RotateCcw className="mr-2 h-4 w-4" />Escolher outro arquivo</Button>
          <Button onClick={() => void registrar()} disabled={processando || novas.length === 0 || novas.length > LIMITE_IMPORTACAO}>
            {processando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Registrar {novas.length} {novas.length === 1 ? 'transação nova' : 'transações novas'}
          </Button>
        </div>
      </CardContent>
    </Card>}

    {processando && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Lendo e conferindo o arquivo…</p>}
  </div>;
}
