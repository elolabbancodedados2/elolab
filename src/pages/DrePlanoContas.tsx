import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, FileSpreadsheet, ListTree, Pencil, Plus, Tags, Wand2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { inicioDoDiaEmFusoIso } from '@/lib/dateOnly';
import { downloadStringAsFile } from '@/lib/auditExport';
import { currentFinanceMonth, formatFinanceMonth, parseFinanceMonth } from '@/lib/financeRouteState';
import {
  GRUPOS_DRE,
  NATUREZAS_DO_GRUPO,
  ROTULO_GRUPO_DRE,
  arvoreDeContas,
  chaveCategoria,
  dreParaCsv,
  montarDre,
  montarEventosCompetencia,
  montarEventosRealizados,
  rotuloCategoria,
  type ContaPlano,
  type GrupoDre,
  type LancamentoRealizavel,
  type LinhaDre,
  type NaturezaConta,
  type PagamentoRealizado,
} from '@/lib/dre';

const ABAS = ['dre', 'plano', 'categorias'] as const;
type Aba = typeof ABAS[number];
const parseAba = (valor: string | null): Aba => (ABAS as readonly string[]).includes(valor ?? '') ? valor as Aba : 'dre';

const SEM_CONTA = '__sem_conta__';
const SEM_PAI = '__sem_pai__';
const FUSO = 'America/Sao_Paulo';
const BOM_UTF8 = String.fromCharCode(0xfeff);

const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const percentual = (v: number | null, comSinal = false) => {
  if (v === null) return '—';
  const texto = `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return comSinal && v > 0 ? `+${texto}` : texto;
};
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

interface Vinculo {
  id: string;
  natureza: NaturezaConta;
  categoria: string;
  conta_id: string;
}

interface FormConta {
  id?: string;
  codigo: string;
  nome: string;
  natureza: NaturezaConta;
  grupo_dre: GrupoDre;
  pai_id: string | null;
}

const FORM_VAZIO: FormConta = { codigo: '', nome: '', natureza: 'despesa', grupo_dre: 'despesas_administrativas', pai_id: null };

function mensagemErro(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === '23505') return 'Já existe uma conta com este código nesta clínica.';
  if (e?.code === '42501') return 'Sem permissão para alterar o plano de contas.';
  return e?.message || 'Não foi possível salvar. Tente novamente.';
}

export default function DrePlanoContas() {
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id ?? null;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const competencia = parseFinanceMonth(searchParams.get('mes')) ?? currentFinanceMonth();
  const aba = parseAba(searchParams.get('aba'));
  const regime = searchParams.get('regime') === 'competencia' ? 'competencia' : 'caixa';

  const atualizarParam = (chave: string, valor: string) => setSearchParams(atual => {
    const proximo = new URLSearchParams(atual);
    proximo.set(chave, valor);
    return proximo;
  });

  const mes = formatFinanceMonth(competencia);
  const mesAnterior = formatFinanceMonth(subMonths(competencia, 1));
  const inicio = format(startOfMonth(subMonths(competencia, 1)), 'yyyy-MM-dd');
  const fimExclusivo = format(addDays(endOfMonth(competencia), 1), 'yyyy-MM-dd');
  const ano = competencia.getFullYear();

  const contasQuery = useQuery({
    queryKey: ['plano-contas', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('plano_contas')
        .select('id,codigo,nome,natureza,grupo_dre,pai_id,ativo')
        .eq('clinica_id', clinicaId!)
        .order('codigo');
      if (error) throw error;
      return (data ?? []) as ContaPlano[];
    },
  });

  const vinculosQuery = useQuery({
    queryKey: ['plano-contas-categorias', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('plano_contas_categorias')
        .select('id,natureza,categoria,conta_id')
        .eq('clinica_id', clinicaId!);
      if (error) throw error;
      return (data ?? []) as Vinculo[];
    },
  });

  // Só o mês e o anterior: pela data, pela data de pagamento (caixa) ou pela competência.
  const fimInclusivo = format(endOfMonth(competencia), 'yyyy-MM-dd');
  const mesSeguinte = formatFinanceMonth(addMonths(competencia, 1));
  const lancamentosQuery = useQuery({
    queryKey: ['dre-lancamentos', clinicaId, inicio, fimInclusivo],
    enabled: !!clinicaId,
    queryFn: async () => {
      const linhas = await buscarEmBlocos<LancamentoRealizavel>(() => supabase.from('lancamentos')
        .select('id,tipo,categoria,status,valor,valor_pago,desconto,acrescimo,competencia,data,data_pagamento')
        .eq('clinica_id', clinicaId!)
        .in('tipo', ['receita', 'despesa'])
        .or([
          `and(data.gte.${inicio},data.lte.${fimInclusivo})`,
          `and(data_pagamento.gte.${inicio},data_pagamento.lte.${fimInclusivo})`,
          `and(competencia.gte.${mesAnterior},competencia.lt.${mesSeguinte})`,
        ].join(','))
        .order('id'), { teto: LIMITE_BUSCA_EM_BLOCOS + 1 });
      return { linhas: linhas.slice(0, LIMITE_BUSCA_EM_BLOCOS), excedeuLimite: linhas.length > LIMITE_BUSCA_EM_BLOCOS };
    },
  });

  const pagamentosQuery = useQuery({
    queryKey: ['dre-pagamentos', clinicaId, inicio, fimExclusivo],
    enabled: !!clinicaId,
    queryFn: async () => {
      const inicioIso = inicioDoDiaEmFusoIso(inicio, FUSO);
      const fimIso = inicioDoDiaEmFusoIso(fimExclusivo, FUSO);
      const selecionar = () => supabase.from('pagamentos')
        .select('id,lancamento_id,valor,data_pagamento,estornado_em,lancamentos!inner(tipo,categoria,clinica_id)')
        .eq('clinica_id', clinicaId!)
        .eq('lancamentos.clinica_id', clinicaId!)
        .order('id');
      const [noPeriodo, estornos] = await Promise.all([
        buscarEmBlocos<PagamentoRealizado>(() => selecionar().gte('data_pagamento', inicioIso).lt('data_pagamento', fimIso)),
        buscarEmBlocos<PagamentoRealizado>(() => selecionar().not('estornado_em', 'is', null).gte('estornado_em', inicioIso).lt('estornado_em', fimIso)),
      ]);
      return [...new Map([...noPeriodo, ...estornos].map(p => [p.id, p] as const)).values()];
    },
  });

  const contas = useMemo(() => contasQuery.data ?? [], [contasQuery.data]);
  const vinculos = useMemo(() => vinculosQuery.data ?? [], [vinculosQuery.data]);
  const lancamentos = useMemo(() => lancamentosQuery.data?.linhas ?? [], [lancamentosQuery.data]);
  const limiteAtingido = Boolean(lancamentosQuery.data?.excedeuLimite) || (pagamentosQuery.data?.length ?? 0) >= LIMITE_BUSCA_EM_BLOCOS;
  const pagamentos = useMemo(() => pagamentosQuery.data ?? [], [pagamentosQuery.data]);

  const dre = useMemo(() => {
    const eventos = regime === 'competencia'
      ? montarEventosCompetencia(lancamentos)
      : montarEventosRealizados(pagamentos, lancamentos, inicio, fimExclusivo);
    return montarDre({
      contas,
      vinculos,
      eventosMes: eventos.filter(e => e.data.slice(0, 7) === mes),
      eventosMesAnterior: eventos.filter(e => e.data.slice(0, 7) === mesAnterior),
    });
  }, [regime, pagamentos, lancamentos, inicio, fimExclusivo, contas, vinculos, mes, mesAnterior]);

  const invalidarPlano = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['plano-contas', clinicaId] }),
      queryClient.invalidateQueries({ queryKey: ['plano-contas-categorias', clinicaId] }),
    ]);
  };

  const criarPadrao = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('criar_plano_contas_padrao');
      if (error) throw error;
      return data as { contas_criadas?: number; categorias_vinculadas?: number } | null;
    },
    onSuccess: resultado => {
      toast.success(`Plano padrão criado: ${plural(resultado?.contas_criadas ?? 0, 'conta', 'contas')} e ${plural(resultado?.categorias_vinculadas ?? 0, 'categoria vinculada', 'categorias vinculadas')}.`);
      void invalidarPlano();
    },
    onError: error => toast.error(mensagemErro(error)),
  });

  const carregando = contasQuery.isLoading || vinculosQuery.isLoading || lancamentosQuery.isLoading || pagamentosQuery.isLoading;
  const queryComErro = [contasQuery, vinculosQuery, lancamentosQuery, pagamentosQuery].find(q => q.isError);

  const exportar = () => {
    downloadStringAsFile({
      content: BOM_UTF8 + dreParaCsv(dre, mes, mesAnterior),
      filename: regime === 'competencia' ? `dre-competencia-${mes}.csv` : `dre-gerencial-${mes}.csv`,
      mimeType: 'text/csv;charset=utf-8',
    });
  };

  const seletorMes = (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-xs">
      <Button aria-label="Mês anterior" variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => atualizarParam('mes', formatFinanceMonth(subMonths(competencia, 1)))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[132px] text-center text-sm font-semibold capitalize text-foreground" aria-live="polite">
        {format(competencia, "MMMM 'de' yyyy", { locale: ptBR })}
      </span>
      <Button aria-label="Próximo mês" variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => atualizarParam('mes', formatFinanceMonth(addMonths(competencia, 1)))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (queryComErro) {
    return (
      <ErrorState
        title="Não foi possível carregar a DRE"
        description="Os valores foram pausados para evitar um resultado incompleto. Tente carregar novamente."
        error={queryComErro.error}
        onRetry={() => { void contasQuery.refetch(); void vinculosQuery.refetch(); void lancamentosQuery.refetch(); void pagamentosQuery.refetch(); }}
      />
    );
  }

  const semPlano = contas.length === 0;
  const estadoSemPlano = (
    <EmptyState
      icon={ListTree}
      title="A clínica ainda não tem plano de contas"
      description="Crie o plano padrão de clínica médica, com as contas de cada grupo da DRE e as categorias do app já vinculadas. Depois ajuste o que precisar."
      action={{ label: criarPadrao.isPending ? 'Criando…' : 'Criar plano padrão', onClick: () => criarPadrao.mutate(), icon: Wand2 }}
    />
  );

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="DRE e plano de contas"
        icon={<FileSpreadsheet />}
        description={regime === 'competencia'
          ? 'Resultado do mês por competência: lançamentos do mês a que pertencem, pagos ou não, organizados pelo plano de contas.'
          : 'Resultado gerencial do mês pelos valores pagos, organizado pelo plano de contas da clínica.'}
        actions={(
          <>
            <Button variant="outline" asChild className="rounded-full">
              <Link to={`/financeiro?mes=${mes}&tab=resumo`}>Visão financeira</Link>
            </Button>
            {aba === 'dre' && !semPlano && (
              <Button variant="outline" className="rounded-full" onClick={exportar}>
                <Download className="mr-2 h-4 w-4" />Exportar CSV
              </Button>
            )}
            {seletorMes}
          </>
        )}
      />

      {limiteAtingido && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            A DRE carregou o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} registros do período. Os totais podem estar incompletos;
            confira os relatórios antes de usar estes valores para fechamento.
          </p>
        </div>
      )}

      <Tabs value={aba} onValueChange={valor => atualizarParam('aba', parseAba(valor))} className="space-y-4">
        <TabsList>
          <TabsTrigger value="dre" className="gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" /> DRE gerencial</TabsTrigger>
          <TabsTrigger value="plano" className="gap-1.5"><ListTree className="h-3.5 w-3.5" /> Plano de contas</TabsTrigger>
          <TabsTrigger value="categorias" className="gap-1.5"><Tags className="h-3.5 w-3.5" /> Categorias</TabsTrigger>
        </TabsList>

        <TabsContent value="dre" className="space-y-4">
          {!semPlano && (
            <div role="group" aria-label="Regime do DRE" className="flex flex-wrap items-center gap-2">
              {([['caixa', 'Por caixa (pago)'], ['competencia', 'Por competência']] as const).map(([valor, rotulo]) => (
                <button key={valor} type="button" aria-pressed={regime === valor} onClick={() => atualizarParam('regime', valor)}
                  className={cn('h-8 rounded-full border px-3 text-xs font-medium transition-colors', regime === valor ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
                  {rotulo}
                </button>
              ))}
            </div>
          )}
          {semPlano ? estadoSemPlano : (
            <AbaDre
              dre={dre}
              rotuloMes={format(competencia, 'MMM/yy', { locale: ptBR })}
              rotuloMesAnterior={format(subMonths(competencia, 1), 'MMM/yy', { locale: ptBR })}
              onMapear={() => atualizarParam('aba', 'categorias')}
            />
          )}
        </TabsContent>

        <TabsContent value="plano" className="space-y-4">
          {semPlano ? estadoSemPlano : <AbaPlano contas={contas} clinicaId={clinicaId!} onAlterado={invalidarPlano} />}
        </TabsContent>

        <TabsContent value="categorias" className="space-y-4">
          <AbaCategorias
            ano={ano}
            contas={contas}
            vinculos={vinculos}
            lancamentos={lancamentos}
            clinicaId={clinicaId!}
            onAlterado={invalidarPlano}
            onCriarPadrao={() => criarPadrao.mutate()}
            criandoPadrao={criarPadrao.isPending}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── DRE ──────────────────────────────────────────────────────────────────

function AbaDre({ dre, rotuloMes, rotuloMesAnterior, onMapear }: {
  dre: ReturnType<typeof montarDre>;
  rotuloMes: string;
  rotuloMesAnterior: string;
  onMapear: () => void;
}) {
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());
  const expansiveis = dre.linhas.filter(l => l.tipo === 'grupo' && l.contas.length > 0);
  const tudoAberto = expansiveis.length > 0 && expansiveis.every(l => abertas.has(l.id));
  const alternar = (id: string) => setAbertas(atual => {
    const proximo = new Set(atual);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    return proximo;
  });
  const linha = (id: string) => dre.linhas.find(l => l.id === id)!;
  const destaques = ['receita_liquida', 'lucro_bruto', 'resultado_operacional', 'resultado_liquido'].map(linha);

  return (
    <>
      {dre.lancamentosSemConta > 0 && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-foreground">
              <strong className="font-semibold">{plural(dre.lancamentosSemConta, 'lançamento sem conta', 'lançamentos sem conta')}</strong>
              {' '}neste mês ({dre.semConta.map(c => rotuloCategoria(c.categoria)).slice(0, 4).join(', ')}{dre.semConta.length > 4 ? '…' : ''}).
              {' '}Eles ficam fora da DRE até a categoria ser ligada a uma conta.
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={onMapear}>Mapear categorias</Button>
        </div>
      )}

      <section aria-label="Resumo do resultado" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {destaques.map(item => (
          <article key={item.id} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{item.rotulo.replace(/^= /, '')}</p>
            <p className={cn('mt-1 font-display text-xl font-semibold tabular-nums', item.valor < 0 ? 'text-destructive' : 'text-foreground')}>
              {moeda(item.valor)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Margem {percentual(item.margem)} · {percentual(item.variacao, true)} vs. {rotuloMesAnterior}
            </p>
          </article>
        ))}
      </section>

      <section aria-labelledby="dre-titulo" className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 id="dre-titulo" className="text-sm font-semibold text-foreground">DRE gerencial</h2>
            <p className="text-xs text-muted-foreground">Valores pagos no mês. Margem sobre a receita líquida.</p>
          </div>
          {expansiveis.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setAbertas(tudoAberto ? new Set() : new Set(expansiveis.map(l => l.id)))}>
              {tudoAberto ? 'Recolher contas' : 'Mostrar todas as contas'}
            </Button>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2 text-left font-medium">Linha</th>
                <th scope="col" className="px-4 py-2 text-right font-medium capitalize">{rotuloMes}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium capitalize">{rotuloMesAnterior}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Variação</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">% receita líquida</th>
              </tr>
            </thead>
            <tbody>
              {dre.linhas.map(item => (
                <LinhaDreTabela key={item.id} linha={item} aberta={abertas.has(item.id)} onAlternar={() => alternar(item.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function LinhaDreTabela({ linha, aberta, onAlternar }: { linha: LinhaDre; aberta: boolean; onAlternar: () => void }) {
  const subtotal = linha.tipo === 'subtotal';
  const expansivel = !subtotal && linha.contas.length > 0;
  const valorClasse = (v: number) => cn('px-4 py-2.5 text-right tabular-nums', v < 0 && subtotal && 'text-destructive');
  return (
    <>
      <tr className={cn('border-b border-border/70', subtotal && 'bg-secondary/60 font-semibold')}>
        <th scope="row" className="px-4 py-2.5 text-left font-[inherit]">
          {expansivel ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={aberta}
              onClick={onAlternar}
            >
              <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', aberta && 'rotate-90')} aria-hidden="true" />
              {linha.rotulo}
              <span className="text-xs font-normal text-muted-foreground">({linha.contas.length})</span>
            </button>
          ) : (
            <span className={cn(!subtotal && 'pl-5')}>{linha.rotulo}</span>
          )}
        </th>
        <td className={valorClasse(linha.valor)}>{moeda(linha.valor)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{moeda(linha.anterior)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{percentual(linha.variacao, true)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{percentual(linha.margem)}</td>
      </tr>
      {aberta && linha.contas.map(conta => (
        <tr key={conta.contaId} className="border-b border-border/50 text-muted-foreground">
          <th scope="row" className="py-2 pl-12 pr-4 text-left font-normal">
            <span className="mr-2 font-mono text-xs">{conta.codigo}</span>{conta.nome}
          </th>
          <td className="px-4 py-2 text-right tabular-nums text-foreground">{moeda(conta.valor)}</td>
          <td className="px-4 py-2 text-right tabular-nums">{moeda(conta.anterior)}</td>
          <td className="px-4 py-2 text-right tabular-nums">{percentual(conta.variacao, true)}</td>
          <td className="px-4 py-2 text-right tabular-nums">{percentual(conta.margem)}</td>
        </tr>
      ))}
    </>
  );
}

// ─── Plano de contas ──────────────────────────────────────────────────────

function AbaPlano({ contas, clinicaId, onAlterado }: { contas: ContaPlano[]; clinicaId: string; onAlterado: () => Promise<void> }) {
  const [form, setForm] = useState<FormConta | null>(null);
  const arvore = useMemo(() => arvoreDeContas(contas), [contas]);

  const alternarAtivo = useMutation({
    mutationFn: async (conta: ContaPlano) => {
      const { error } = await supabase.from('plano_contas').update({ ativo: !conta.ativo }).eq('id', conta.id).eq('clinica_id', clinicaId);
      if (error) throw error;
      return conta;
    },
    onSuccess: conta => { toast.success(conta.ativo ? `Conta ${conta.codigo} desativada.` : `Conta ${conta.codigo} reativada.`); void onAlterado(); },
    onError: error => toast.error(mensagemErro(error)),
  });

  const ativas = contas.filter(c => c.ativo).length;

  return (
    <section aria-labelledby="plano-titulo" className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 id="plano-titulo" className="text-sm font-semibold text-foreground">Plano de contas</h2>
          <p className="text-xs text-muted-foreground">{plural(contas.length, 'conta', 'contas')} · {plural(ativas, 'ativa', 'ativas')}. Contas não são apagadas: desative as que não usa mais.</p>
        </div>
        <Button size="sm" className="rounded-full" onClick={() => setForm({ ...FORM_VAZIO })}>
          <Plus className="mr-1.5 h-4 w-4" />Nova conta
        </Button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2 text-left font-medium">Código e nome</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Natureza</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Grupo da DRE</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Situação</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {arvore.map(({ conta, nivel }) => (
              <tr key={conta.id} className={cn('border-b border-border/70', !conta.ativo && 'text-muted-foreground')}>
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  <span style={{ paddingLeft: `${nivel * 1.25}rem` }} className="inline-flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{conta.codigo}</span>
                    <span className={cn(nivel === 0 && 'font-medium')}>{conta.nome}</span>
                  </span>
                </th>
                <td className="px-4 py-2 capitalize">{conta.natureza}</td>
                <td className="px-4 py-2">{ROTULO_GRUPO_DRE[conta.grupo_dre] ?? conta.grupo_dre}</td>
                <td className="px-4 py-2">
                  <Badge variant={conta.ativo ? 'outline' : 'muted'}>{conta.ativo ? 'Ativa' : 'Inativa'}</Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar conta ${conta.codigo}`}
                      onClick={() => setForm({ id: conta.id, codigo: conta.codigo, nome: conta.nome, natureza: conta.natureza, grupo_dre: conta.grupo_dre, pai_id: conta.pai_id })}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />Editar
                    </Button>
                    <Button variant="ghost" size="sm" disabled={alternarAtivo.isPending} onClick={() => alternarAtivo.mutate(conta)}>
                      {conta.ativo ? 'Desativar' : 'Reativar'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <DialogConta
          form={form}
          contas={contas}
          clinicaId={clinicaId}
          onFechar={() => setForm(null)}
          onSalvo={() => { setForm(null); void onAlterado(); }}
        />
      )}
    </section>
  );
}

function DialogConta({ form: inicial, contas, clinicaId, onFechar, onSalvo }: {
  form: FormConta;
  contas: ContaPlano[];
  clinicaId: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<FormConta>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const editando = !!inicial.id;

  // A conta não pode ficar abaixo dela mesma nem de uma descendente.
  const paisPossiveis = useMemo(() => {
    const bloqueados = new Set<string>();
    if (inicial.id) {
      bloqueados.add(inicial.id);
      let mudou = true;
      while (mudou) {
        mudou = false;
        for (const c of contas) {
          if (c.pai_id && bloqueados.has(c.pai_id) && !bloqueados.has(c.id)) { bloqueados.add(c.id); mudou = true; }
        }
      }
    }
    return arvoreDeContas(contas).filter(n => !bloqueados.has(n.conta.id) && (n.conta.ativo || n.conta.id === inicial.pai_id));
  }, [contas, inicial.id, inicial.pai_id]);

  const gruposPermitidos = GRUPOS_DRE.filter(g => NATUREZAS_DO_GRUPO[g].includes(form.natureza));

  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        codigo: form.codigo.trim(),
        nome: form.nome.trim(),
        natureza: form.natureza,
        grupo_dre: form.grupo_dre,
        pai_id: form.pai_id,
      };
      const escrita = form.id
        ? supabase.from('plano_contas').update(dados).eq('id', form.id).eq('clinica_id', clinicaId)
        : supabase.from('plano_contas').insert({ ...dados, clinica_id: clinicaId });
      const { error } = await escrita;
      if (error) throw error;
    },
    onSuccess: () => { toast.success(editando ? 'Conta atualizada.' : 'Conta criada.'); onSalvo(); },
    onError: error => setErro(mensagemErro(error)),
  });

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (!/^[0-9A-Za-z]+(\.[0-9A-Za-z]+)*$/.test(form.codigo.trim()) || form.codigo.trim().length > 30) {
      setErro('Use um código como 1, 4.2 ou 4.2.1 (letras e números separados por ponto).');
      return;
    }
    if (form.nome.trim().length < 2) {
      setErro('Informe o nome da conta.');
      return;
    }
    setErro(null);
    salvar.mutate();
  };

  return (
    <Dialog open onOpenChange={aberto => { if (!aberto) onFechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar conta ${inicial.codigo}` : 'Nova conta'}</DialogTitle>
            <DialogDescription>O grupo define em que linha da DRE os valores da conta aparecem.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="conta-codigo">Código</Label>
              <Input id="conta-codigo" value={form.codigo} maxLength={30} placeholder="4.2" onChange={e => setForm({ ...form, codigo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conta-nome">Nome</Label>
              <Input id="conta-nome" value={form.nome} maxLength={120} placeholder="Serviços de terceiros" onChange={e => setForm({ ...form, nome: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="conta-natureza">Natureza</Label>
              <Select
                value={form.natureza}
                onValueChange={valor => {
                  const natureza = valor as NaturezaConta;
                  const grupo = NATUREZAS_DO_GRUPO[form.grupo_dre].includes(natureza)
                    ? form.grupo_dre
                    : GRUPOS_DRE.find(g => NATUREZAS_DO_GRUPO[g].includes(natureza))!;
                  setForm({ ...form, natureza, grupo_dre: grupo });
                }}
              >
                <SelectTrigger id="conta-natureza"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conta-grupo">Grupo da DRE</Label>
              <Select value={form.grupo_dre} onValueChange={valor => setForm({ ...form, grupo_dre: valor as GrupoDre })}>
                <SelectTrigger id="conta-grupo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {gruposPermitidos.map(g => <SelectItem key={g} value={g}>{ROTULO_GRUPO_DRE[g]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conta-pai">Conta agrupadora (opcional)</Label>
            <Select value={form.pai_id ?? SEM_PAI} onValueChange={valor => setForm({ ...form, pai_id: valor === SEM_PAI ? null : valor })}>
              <SelectTrigger id="conta-pai"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PAI}>Nenhuma (conta principal)</SelectItem>
                {paisPossiveis.map(({ conta, nivel }) => (
                  <SelectItem key={conta.id} value={conta.id}>{`${'\u2003'.repeat(nivel)}${conta.codigo} · ${conta.nome}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar conta'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Categorias ───────────────────────────────────────────────────────────

interface CategoriaResumo {
  chave: string;
  natureza: NaturezaConta;
  categoria: string;
  quantidade: number;
  total: number;
}

function AbaCategorias({ ano, contas, vinculos, lancamentos, clinicaId, onAlterado, onCriarPadrao, criandoPadrao }: {
  ano: number;
  contas: ContaPlano[];
  vinculos: Vinculo[];
  lancamentos: LancamentoRealizavel[];
  clinicaId: string;
  onAlterado: () => Promise<void>;
  onCriarPadrao: () => void;
  criandoPadrao: boolean;
}) {
  const [pendentes, setPendentes] = useState<Record<string, string>>({});

  const vinculoPorChave = useMemo(
    () => new Map(vinculos.map(v => [chaveCategoria(v.natureza, v.categoria), v])),
    [vinculos],
  );

  const categorias = useMemo<CategoriaResumo[]>(() => {
    const prefixoAno = `${ano}-`;
    const mapa = new Map<string, CategoriaResumo>();
    for (const l of lancamentos) {
      if (l.tipo !== 'receita' && l.tipo !== 'despesa') continue;
      const categoria = l.categoria || 'outros';
      const chave = chaveCategoria(l.tipo, categoria);
      const item = mapa.get(chave) ?? { chave, natureza: l.tipo, categoria, quantidade: 0, total: 0 };
      if (l.status !== 'cancelado' && (l.data ?? '').startsWith(prefixoAno)) {
        item.quantidade += 1;
        item.total += Number(l.valor) || 0;
      }
      mapa.set(chave, item);
    }
    return [...mapa.values()].sort((a, b) => a.natureza.localeCompare(b.natureza) || b.total - a.total || a.categoria.localeCompare(b.categoria));
  }, [lancamentos, ano]);

  const contaAtual = (chave: string) => pendentes[chave] ?? vinculoPorChave.get(chave)?.conta_id ?? SEM_CONTA;
  const alteradas = categorias.filter(c => pendentes[c.chave] !== undefined && pendentes[c.chave] !== (vinculoPorChave.get(c.chave)?.conta_id ?? SEM_CONTA));
  const semVinculo = categorias.filter(c => contaAtual(c.chave) === SEM_CONTA).length;
  const opcoes = (natureza: NaturezaConta, selecionada: string) => arvoreDeContas(contas)
    .filter(n => n.conta.natureza === natureza && (n.conta.ativo || n.conta.id === selecionada));

  const salvar = useMutation({
    mutationFn: async () => {
      const upserts = alteradas
        .filter(c => pendentes[c.chave] !== SEM_CONTA)
        .map(c => ({ clinica_id: clinicaId, natureza: c.natureza, categoria: c.categoria, conta_id: pendentes[c.chave] }));
      const remover = alteradas
        .filter(c => pendentes[c.chave] === SEM_CONTA)
        .map(c => vinculoPorChave.get(c.chave)?.id)
        .filter((id): id is string => !!id);
      if (upserts.length) {
        const { error } = await supabase.from('plano_contas_categorias').upsert(upserts, { onConflict: 'clinica_id,natureza,categoria' });
        if (error) throw error;
      }
      if (remover.length) {
        const { error } = await supabase.from('plano_contas_categorias').delete().in('id', remover).eq('clinica_id', clinicaId);
        if (error) throw error;
      }
      return upserts.length + remover.length;
    },
    onSuccess: async total => {
      toast.success(`${plural(total, 'vínculo salvo', 'vínculos salvos')}.`);
      await onAlterado();
      setPendentes({});
    },
    onError: error => toast.error(mensagemErro(error)),
  });

  if (categorias.length === 0) {
    return (
      <EmptyState
        icon={Tags}
        title="Nenhuma categoria lançada"
        description="As categorias aparecem aqui assim que houver receitas ou despesas lançadas no financeiro."
      />
    );
  }

  return (
    <section aria-labelledby="categorias-titulo" className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 id="categorias-titulo" className="text-sm font-semibold text-foreground">Categorias dos lançamentos</h2>
          <p className="text-xs text-muted-foreground">
            Ligue cada categoria a uma conta do plano. Quantidade e total lançados em {ano}, sem cancelados.
            {semVinculo > 0 && <> {plural(semVinculo, 'categoria ainda sem conta', 'categorias ainda sem conta')}.</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {contas.length === 0 && (
            <Button size="sm" variant="outline" className="rounded-full" disabled={criandoPadrao} onClick={onCriarPadrao}>
              <Wand2 className="mr-1.5 h-4 w-4" />{criandoPadrao ? 'Criando…' : 'Criar plano padrão'}
            </Button>
          )}
          <Button size="sm" className="rounded-full" disabled={alteradas.length === 0 || salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending ? 'Salvando…' : alteradas.length ? `Salvar ${plural(alteradas.length, 'vínculo', 'vínculos')}` : 'Salvar vínculos'}
          </Button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2 text-left font-medium">Categoria</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Natureza</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Lançamentos em {ano}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Total em {ano}</th>
              <th scope="col" className="w-[320px] px-4 py-2 text-left font-medium">Conta</th>
            </tr>
          </thead>
          <tbody>
            {categorias.map(c => {
              const selecionada = contaAtual(c.chave);
              const nomeCategoria = rotuloCategoria(c.categoria);
              return (
                <tr key={c.chave} className="border-b border-border/70">
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <span className="font-medium text-foreground">{nomeCategoria}</span>
                    {nomeCategoria !== c.categoria && <span className="ml-2 font-mono text-xs text-muted-foreground">{c.categoria}</span>}
                  </th>
                  <td className="px-4 py-2 capitalize">{c.natureza}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.quantidade.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{moeda(c.total)}</td>
                  <td className="px-4 py-2">
                    <Select value={selecionada} onValueChange={valor => setPendentes(atual => ({ ...atual, [c.chave]: valor }))}>
                      <SelectTrigger
                        aria-label={`Conta da categoria ${nomeCategoria} (${c.natureza})`}
                        className={cn('h-9', selecionada === SEM_CONTA && 'border-warning/50 text-muted-foreground')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_CONTA}>Sem conta</SelectItem>
                        {opcoes(c.natureza, selecionada).map(({ conta, nivel }) => (
                          <SelectItem key={conta.id} value={conta.id}>{`${'\u2003'.repeat(nivel)}${conta.codigo} · ${conta.nome}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
