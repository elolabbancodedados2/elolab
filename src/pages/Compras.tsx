import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Building2, ChevronDown, ChevronRight, ClipboardList, Package, PackageCheck,
  Plus, Search, Send, ShoppingCart, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { useConfirmacao } from '@/hooks/useConfirmacao';
import { linkWhatsApp } from '@/lib/whatsapp';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';
import {
  baixarPdfPedidoCompra, linkEmailPedido, pedidoAtrasado, previsaoEntrega, textoPedidoCompra,
  textoVariacao, variacaoPercentual,
} from '@/lib/pedidoCompraDocumento';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  compararCotacao, formatarCnpj, lerPreco, normalizarCnpj,
  ROTULO_SITUACAO_COTACAO, ROTULO_SITUACAO_PEDIDO,
  type SituacaoCotacao, type SituacaoPedidoCompra,
  economiaSobreMaisCaro, contaPagarDoPedido, numeroPedidoCompra, calcularEstouros, type EstouroMaximo,
} from '@/lib/compras';
import { criarCotacao, mensagemErroCompras, type NovoItemCotacao } from '@/lib/comprasApi';

type Aba = 'cotacoes' | 'pedidos' | 'fornecedores';

interface Fornecedor {
  id: string; nome: string; cnpj: string | null; contato: string | null;
  telefone: string | null; email: string | null; ativo: boolean;
}

const normalizarBusca = (valor: unknown) => String(valor ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('pt-BR');

const formatarData = (valor: string | null | undefined) => {
  if (!valor) return '—';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(data);
};

const precoParaTexto = (valor: number | null | undefined) =>
  valor === null || valor === undefined ? '' : Number(valor).toFixed(2).replace('.', ',');

function Situacao({ tom, children }: { tom: 'ativo' | 'neutro' | 'apagado'; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
      tom === 'ativo' && 'border-foreground/20 bg-secondary text-foreground',
      tom === 'neutro' && 'border-border bg-card text-foreground',
      tom === 'apagado' && 'border-border bg-muted text-muted-foreground')}>
      {children}
    </span>
  );
}

const tomCotacao = (s: string) => (s === 'aberta' ? 'ativo' : s === 'fechada' ? 'neutro' : 'apagado');
const tomPedido = (s: string) => (s === 'emitido' ? 'ativo' : s === 'recebido' ? 'neutro' : 'apagado');

export default function Compras() {
  const { profile } = useSupabaseAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const abaParam = searchParams.get('aba');
  const aba: Aba = abaParam === 'pedidos' || abaParam === 'fornecedores' ? abaParam : 'cotacoes';
  const clinicaId = profile?.clinica_id ?? null;
  const roles: string[] = profile?.roles ?? [];
  const podeGerir = roles.includes('admin') || roles.includes('enfermagem');
  // Mesmos perfis da rota /contas/pagar/nova.
  const podeLancarConta = roles.includes('admin') || roles.includes('financeiro');

  const mudarAba = (nova: Aba) => {
    const params = new URLSearchParams(searchParams);
    params.set('aba', nova);
    if (nova !== 'cotacoes') { params.delete('cotacao'); params.delete('nova'); }
    setSearchParams(params, { replace: true });
  };

  const fornecedoresQuery = useQuery({
    queryKey: ['compras', 'fornecedores', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores').select('*')
        .eq('clinica_id', clinicaId!).order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Fornecedor[];
    },
  });

  if (!clinicaId) {
    return <ErrorState title="Clínica não identificada" description="As compras não podem ser exibidas sem identificar a clínica atual." />;
  }

  const abas: { key: Aba; label: string; icon: typeof ShoppingCart }[] = [
    { key: 'cotacoes', label: 'Cotações', icon: ClipboardList },
    { key: 'pedidos', label: 'Pedidos', icon: Package },
    { key: 'fornecedores', label: 'Fornecedores', icon: Building2 },
  ];

  return (
    <main className="space-y-6 pb-24 lg:pb-8">
      <Tabs value={aba} onValueChange={valor => mudarAba(valor as Aba)} className="space-y-6">
        <PageHeader
          title="Compras"
          description="Cotação com vários fornecedores, pedido pelo menor preço e entrada no estoque ao receber."
          icon={<ShoppingCart />}
          actions={<>
            <TabsList aria-label="Seções de compras">
              {abas.map(({ key, label, icon: Icon }) => (
                <TabsTrigger key={key} value={key} className="gap-1.5">
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" /> {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button variant="outline" className="rounded-full" onClick={() => navigate('/estoque')}>Estoque</Button>
          </>}
        />

        <TabsContent value="cotacoes" className="mt-0"><AbaCotacoes clinicaId={clinicaId} podeGerir={podeGerir} fornecedores={fornecedoresQuery.data ?? []} /></TabsContent>
        <TabsContent value="pedidos" className="mt-0"><AbaPedidos clinicaId={clinicaId} podeGerir={podeGerir} podeLancarConta={podeLancarConta} /></TabsContent>
        <TabsContent value="fornecedores" className="mt-0"><AbaFornecedores clinicaId={clinicaId} podeGerir={podeGerir} query={fornecedoresQuery} /></TabsContent>
      </Tabs>
    </main>
  );
}

// ─── Cotações ───────────────────────────────────────────────────────────────

function AbaCotacoes({ clinicaId, podeGerir, fornecedores }: { clinicaId: string; podeGerir: boolean; fornecedores: Fornecedor[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selecionada = searchParams.get('cotacao');
  const criando = searchParams.get('nova') === '1' && podeGerir;

  const selecionar = (id: string | null, nova = false) => {
    const params = new URLSearchParams(searchParams);
    params.set('aba', 'cotacoes');
    if (id) params.set('cotacao', id); else params.delete('cotacao');
    if (nova) params.set('nova', '1'); else params.delete('nova');
    setSearchParams(params, { replace: true });
  };

  const cotacoesQuery = useQuery({
    queryKey: ['compras', 'cotacoes', clinicaId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cotacoes_compra')
        .select('id, titulo, status, observacoes, created_at, cotacao_itens(id)')
        .eq('clinica_id', clinicaId).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const cotacoes = useMemo(() => cotacoesQuery.data ?? [], [cotacoesQuery.data]);

  useEffect(() => {
    if (!selecionada && !criando && cotacoes.length > 0) {
      const params = new URLSearchParams(searchParams);
      params.set('cotacao', (cotacoes.find(c => c.status === 'aberta') ?? cotacoes[0]).id);
      setSearchParams(params, { replace: true });
    }
  }, [selecionada, criando, cotacoes, searchParams, setSearchParams]);

  if (cotacoesQuery.isError) {
    return <ErrorState title="Não foi possível carregar as cotações" error={cotacoesQuery.error} onRetry={() => void cotacoesQuery.refetch()} />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
      <section aria-label="Cotações" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Cotações</h2>
          {podeGerir && <Button size="sm" className="h-8 gap-1.5" onClick={() => selecionar(null, true)}><Plus className="h-3.5 w-3.5" />Nova cotação</Button>}
        </div>
        {cotacoesQuery.isLoading ? <div className="p-4"><TableSkeleton rows={4} cols={1} /></div>
          : cotacoes.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma cotação ainda.</p>
          : (
            <ul className="divide-y divide-border">
              {cotacoes.map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => selecionar(c.id)} aria-current={selecionada === c.id && !criando ? 'true' : undefined}
                    className={cn('flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      selecionada === c.id && !criando && 'bg-primary/5')}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.titulo}</span>
                      <Situacao tom={tomCotacao(c.status)}>{ROTULO_SITUACAO_COTACAO[c.status as SituacaoCotacao] ?? c.status}</Situacao>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatarData(c.created_at)} · {c.cotacao_itens?.length ?? 0} {c.cotacao_itens?.length === 1 ? 'item' : 'itens'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>

      <div className="min-w-0">
        {criando ? (
          <NovaCotacao clinicaId={clinicaId} onCancelar={() => selecionar(null)} onCriada={id => selecionar(id)} />
        ) : selecionada ? (
          <DetalheCotacao key={selecionada} cotacaoId={selecionada} podeGerir={podeGerir} fornecedores={fornecedores} />
        ) : !cotacoesQuery.isLoading && (
          <EmptyState icon={ClipboardList} title="Nenhuma cotação aberta"
            description="Crie uma cotação com os itens que precisa comprar e lance o preço de cada fornecedor para comparar."
            action={podeGerir ? { label: 'Nova cotação', onClick: () => selecionar(null, true), icon: Plus } : undefined} />
        )}
      </div>
    </div>
  );
}

interface LinhaNovoItem extends NovoItemCotacao { chave: string }

function NovaCotacao({ clinicaId, onCancelar, onCriada }: { clinicaId: string; onCancelar: () => void; onCriada: (id: string) => void }) {
  const queryClient = useQueryClient();
  const concluida = useRef(false);
  const [titulo, setTitulo] = useState(() => `Cotação de ${formatarData(new Date().toISOString())}`);
  const [observacoes, setObservacoes] = useState('');
  const [itens, setItens] = useState<LinhaNovoItem[]>([]);
  const [busca, setBusca] = useState('');

  const estoqueQuery = useQuery({
    queryKey: ['compras', 'estoque-busca', clinicaId],
    queryFn: async () => {
      const { data, error } = await supabase.from('estoque').select('id, nome, unidade, quantidade, quantidade_minima')
        .eq('clinica_id', clinicaId).order('nome', { ascending: true }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const sugestoes = useMemo(() => {
    const q = normalizarBusca(busca);
    if (!q) return [];
    const usados = new Set(itens.map(i => i.estoque_id));
    return (estoqueQuery.data ?? []).filter(e => !usados.has(e.id) && normalizarBusca(e.nome).includes(q)).slice(0, 6);
  }, [busca, itens, estoqueQuery.data]);

  const adicionar = (item: NovoItemCotacao) => setItens(atual => [...atual, { ...item, chave: crypto.randomUUID() }]);
  const alterar = (chave: string, campo: Partial<NovoItemCotacao>) => setItens(atual => atual.map(i => (i.chave === chave ? { ...i, ...campo } : i)));

  const criar = useMutation({
    mutationFn: () => criarCotacao({ clinicaId, titulo, observacoes, itens: itens.map(({ chave: _chave, ...item }) => item) }),
    onSuccess: id => {
      concluida.current = true;
      toast.success('Cotação criada. Lance agora as propostas dos fornecedores.');
      void queryClient.invalidateQueries({ queryKey: ['compras', 'cotacoes', clinicaId] });
      onCriada(id);
    },
    onError: erro => toast.error(mensagemErroCompras(erro)),
  });

  const itensValidos = itens.filter(i => i.descricao.trim() && Number.isSafeInteger(i.quantidade) && i.quantidade > 0);
  const itensInvalidos = itens
    .map((item, indice) => ({ item, indice }))
    .filter(({ item }) => !(item.descricao.trim() && Number.isSafeInteger(item.quantidade) && item.quantidade > 0));
  const motivoBloqueio = !titulo.trim()
    ? 'Informe o título da cotação.'
    : itens.length === 0
      ? 'Inclua ao menos um item para criar a cotação.'
      : itensInvalidos.length > 0
        ? `Preencha descrição e quantidade (inteiro maior que zero) do ${itensInvalidos.map(({ item, indice }) => item.descricao.trim() || `item ${indice + 1}`).join(', ')}.`
        : null;
  const rascunhoAlterado = itens.length > 0 || observacoes.trim() !== '';

  return (
    <section aria-label="Nova cotação" className="space-y-4 rounded-xl border border-border bg-card p-4">
      <UnsavedChangesGuard dirty={rascunhoAlterado} busy={criar.isPending} completed={concluida} />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Nova cotação</h2>
        <Button variant="ghost" size="icon" onClick={onCancelar} aria-label="Fechar nova cotação"><X className="h-4 w-4" /></Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cotacao-titulo">Título</Label>
          <Input id="cotacao-titulo" value={titulo} maxLength={200} onChange={e => setTitulo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cotacao-observacoes">Observações</Label>
          <Textarea id="cotacao-observacoes" rows={1} value={observacoes} maxLength={2000} onChange={e => setObservacoes(e.target.value)} placeholder="Opcional" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cotacao-busca-estoque">Adicionar item do estoque</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="cotacao-busca-estoque" className="pl-9" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Busque pelo nome do produto" />
          </div>
          <Button variant="outline" className="gap-1.5" onClick={() => adicionar({ estoque_id: null, descricao: '', quantidade: 1, unidade: 'unidade' })}>
            <Plus className="h-4 w-4" />Item com descrição livre
          </Button>
        </div>
        {sugestoes.length > 0 && (
          <ul aria-label="Produtos encontrados" className="flex flex-wrap gap-2">
            {sugestoes.map(e => (
              <li key={e.id}>
                <button type="button" onClick={() => { adicionar({ estoque_id: e.id, descricao: e.nome, quantidade: 1, unidade: e.unidade }); setBusca(''); }}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {e.nome} <span className="text-muted-foreground">· saldo {e.quantidade}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {itens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum item ainda. Busque no estoque ou inclua um item com descrição livre.
        </p>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="w-28">Quantidade</TableHead><TableHead className="w-32">Unidade</TableHead><TableHead className="w-12"><span className="sr-only">Remover</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {itens.map((item, indice) => (
              <TableRow key={item.chave}>
                <TableCell>
                  <Input aria-label={`Descrição do item ${indice + 1}`} value={item.descricao} maxLength={300} onChange={e => alterar(item.chave, { descricao: e.target.value })} />
                  {item.estoque_id && <span className="mt-1 block text-[11px] text-muted-foreground">Vinculado ao estoque: entra no saldo ao receber o pedido</span>}
                </TableCell>
                <TableCell>
                  <Input aria-label={`Quantidade do item ${indice + 1}`} type="number" min={1} step={1} inputMode="numeric" value={item.quantidade || ''}
                    onChange={e => alterar(item.chave, { quantidade: Math.trunc(Number(e.target.value)) })} />
                </TableCell>
                <TableCell>
                  <Input aria-label={`Unidade do item ${indice + 1}`} value={item.unidade ?? ''} maxLength={40} onChange={e => alterar(item.chave, { unidade: e.target.value || null })} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" aria-label={`Remover ${item.descricao || 'item'}`} onClick={() => setItens(atual => atual.filter(i => i.chave !== item.chave))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {motivoBloqueio && <p id="nova-cotacao-motivo" className="mr-auto text-xs text-muted-foreground" role="status">{motivoBloqueio}</p>}
        <Button variant="outline" onClick={onCancelar} disabled={criar.isPending}>Cancelar</Button>
        <Button onClick={() => criar.mutate()} aria-describedby={motivoBloqueio ? 'nova-cotacao-motivo' : undefined}
          disabled={criar.isPending || !!motivoBloqueio || itensValidos.length === 0}>
          {criar.isPending ? 'Criando...' : 'Criar cotação'}
        </Button>
      </div>
    </section>
  );
}

function DetalheCotacao({ cotacaoId, podeGerir, fornecedores }: { cotacaoId: string; podeGerir: boolean; fornecedores: Fornecedor[] }) {
  const queryClient = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const [confirmarGerar, setConfirmarGerar] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  const detalheQuery = useQuery({
    queryKey: ['compras', 'cotacao', cotacaoId],
    queryFn: async () => {
      const { data: cotacao, error } = await supabase.from('cotacoes_compra').select('*').eq('id', cotacaoId).maybeSingle();
      if (error) throw error;
      if (!cotacao) return null;
      const { data: itens, error: itensError } = await supabase.from('cotacao_itens').select('*')
        .eq('cotacao_id', cotacaoId).order('created_at', { ascending: true }).order('descricao', { ascending: true });
      if (itensError) throw itensError;
      const ids = (itens ?? []).map(i => i.id);
      let propostas: { id: string; cotacao_item_id: string; fornecedor_id: string; preco_unitario: number; prazo_dias: number | null; observacao: string | null }[] = [];
      if (ids.length > 0) {
        const { data, error: propostasError } = await supabase.from('cotacao_propostas')
          .select('id, cotacao_item_id, fornecedor_id, preco_unitario, prazo_dias, observacao').in('cotacao_item_id', ids);
        if (propostasError) throw propostasError;
        propostas = data ?? [];
      }
      return { cotacao, itens: itens ?? [], propostas };
    },
  });

  const comparacao = useMemo(() => compararCotacao(
    (detalheQuery.data?.itens ?? []).map(i => ({ id: i.id, descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade })),
    (detalheQuery.data?.propostas ?? []).map(p => ({ ...p, preco_unitario: Number(p.preco_unitario) })),
    fornecedores,
  ), [detalheQuery.data, fornecedores]);

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['compras'] });
  };

  const gerar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('gerar_pedidos_da_cotacao', { p_cotacao_id: cotacaoId });
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: ids => {
      toast.success(ids.length === 1 ? '1 pedido emitido.' : `${ids.length} pedidos emitidos.`);
      setConfirmarGerar(false);
      invalidar();
      setSearchParams(new URLSearchParams({ aba: 'pedidos' }), { replace: true });
    },
    onError: erro => toast.error(mensagemErroCompras(erro)),
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cotacoes_compra').update({ status: 'cancelada' }).eq('id', cotacaoId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Cotação cancelada.'); setConfirmarCancelar(false); invalidar(); },
    onError: erro => toast.error(mensagemErroCompras(erro)),
  });

  if (detalheQuery.isLoading) return <div className="rounded-xl border border-border bg-card p-4"><TableSkeleton rows={4} cols={4} /></div>;
  if (detalheQuery.isError) return <ErrorState title="Não foi possível carregar a cotação" error={detalheQuery.error} onRetry={() => void detalheQuery.refetch()} />;
  if (!detalheQuery.data) return <ErrorState title="Cotação não encontrada" description="A cotação não está disponível nesta clínica." />;

  const { cotacao, itens, propostas } = detalheQuery.data;
  const aberta = cotacao.status === 'aberta';
  const pedidosPrevistos = comparacao.totais.filter(t => t.itensVencidos > 0).length;

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{cotacao.titulo}</h2>
            <Situacao tom={tomCotacao(cotacao.status)}>{ROTULO_SITUACAO_COTACAO[cotacao.status as SituacaoCotacao] ?? cotacao.status}</Situacao>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Criada em {formatarData(cotacao.created_at)} · {itens.length} {itens.length === 1 ? 'item' : 'itens'} · {comparacao.fornecedores.length} {comparacao.fornecedores.length === 1 ? 'fornecedor' : 'fornecedores'} com proposta
            {cotacao.observacoes ? ` · ${cotacao.observacoes}` : ''}
          </p>
        </div>
        {aberta && podeGerir && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setConfirmarCancelar(true)}>Cancelar cotação</Button>
            <Button className="gap-1.5" disabled={!comparacao.podeGerarPedidos || gerar.isPending} onClick={() => setConfirmarGerar(true)}>
              <ShoppingCart className="h-4 w-4" />Gerar pedidos com menor preço
            </Button>
          </div>
        )}
      </section>

      {aberta && comparacao.itensSemProposta.length > 0 && itens.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>Sem proposta: {comparacao.itensSemProposta.map(i => i.descricao).join(', ')}. Lance ao menos um preço por item para gerar os pedidos.</p>
        </div>
      )}

      <GradeComparacao comparacao={comparacao} />

      {aberta && podeGerir && (
        <LancarProposta clinicaId={cotacao.clinica_id} itens={itens} propostas={propostas} fornecedores={fornecedores.filter(f => f.ativo)} onSalvo={() => void detalheQuery.refetch()} />
      )}

      <ConfirmDialog open={confirmarGerar} onOpenChange={setConfirmarGerar} title="Gerar pedidos com menor preço"
        description={`Serão emitidos ${pedidosPrevistos} ${pedidosPrevistos === 1 ? 'pedido' : 'pedidos'}, total de ${formatCurrency(comparacao.totalMenorPreco)}. A cotação será fechada e não poderá mais ser alterada.`}
        confirmLabel="Gerar pedidos" onConfirm={() => gerar.mutate()} isLoading={gerar.isPending} closeOnConfirm={false} />
      <ConfirmDialog open={confirmarCancelar} onOpenChange={setConfirmarCancelar} title="Cancelar cotação"
        description="A cotação deixa de aceitar propostas e não gera pedidos. Esta ação não pode ser desfeita."
        confirmLabel="Cancelar cotação" variant="destructive" onConfirm={() => cancelar.mutate()} isLoading={cancelar.isPending} closeOnConfirm={false} />
    </div>
  );
}

function GradeComparacao({ comparacao }: { comparacao: ReturnType<typeof compararCotacao> }) {
  if (comparacao.linhas.length === 0) {
    return <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Esta cotação não tem itens.</p>;
  }
  const economia = economiaSobreMaisCaro(comparacao);
  return (
    <section aria-label="Comparação de preços" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Comparação item × fornecedor</h3>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Total com menor preço <strong className="ml-1 text-sm tabular-nums text-foreground">{formatCurrency(comparacao.totalMenorPreco)}</strong></span>
          {economia !== null && economia > 0 && (
            <span>Economia sobre o mais caro <strong className="ml-1 text-sm tabular-nums text-foreground">{formatCurrency(economia)}</strong></span>
          )}
        </span>
      </div>
      <ul aria-label="Comparação por item" className="divide-y divide-border md:hidden">
        {comparacao.linhas.map(linha => (
          <li key={linha.item.id} className="space-y-2 px-4 py-3">
            <div>
              <p className="font-medium [overflow-wrap:anywhere]">{linha.item.descricao}</p>
              <p className="text-xs text-muted-foreground">{linha.item.quantidade} {linha.item.unidade ?? ''}{linha.empate ? ' · empate no menor preço, vence o menor prazo' : ''}</p>
              {linha.semProposta && <p className="text-xs font-medium text-warning-foreground">Sem proposta</p>}
            </div>
            {comparacao.fornecedores.filter(f => linha.celulas[f.id]).length > 0 && (
              <ul className="space-y-1">
                {comparacao.fornecedores.filter(f => linha.celulas[f.id]).map(f => {
                  const celula = linha.celulas[f.id];
                  return (
                    <li key={f.id} className={cn('flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm tabular-nums',
                      celula.vencedora ? 'border-foreground font-semibold text-foreground' : 'border-border text-muted-foreground')}>
                      <span className="min-w-0 truncate">{f.nome}{celula.vencedora ? ' · vence' : ''}</span>
                      <span className="shrink-0 text-right">{formatCurrency(celula.precoUnitario)}<span className="block text-[11px] font-normal">{formatCurrency(celula.subtotal)}{celula.prazoDias !== null ? ` · ${celula.prazoDias}d` : ''}</span></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Item</TableHead>
              {comparacao.fornecedores.map(f => <TableHead key={f.id} className="min-w-[140px] text-right">{f.nome}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparacao.linhas.map(linha => (
              <TableRow key={linha.item.id}>
                <TableCell>
                  <span className="block font-medium">{linha.item.descricao}</span>
                  <span className="text-xs text-muted-foreground">{linha.item.quantidade} {linha.item.unidade ?? ''}{linha.empate ? ' · empate no menor preço, vence o menor prazo' : ''}</span>
                  {linha.semProposta && <span className="block text-xs font-medium text-warning-foreground">Sem proposta</span>}
                </TableCell>
                {comparacao.fornecedores.map(f => {
                  const celula = linha.celulas[f.id];
                  return (
                    <TableCell key={f.id} className="text-right">
                      {celula ? (
                        <div data-menor-preco={celula.vencedora ? 'true' : undefined}
                          className={cn('inline-flex flex-col items-end rounded-md border px-2 py-1 tabular-nums',
                            celula.vencedora ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground')}>
                          <span>{formatCurrency(celula.precoUnitario)}</span>
                          <span className="text-[11px] font-normal">{formatCurrency(celula.subtotal)}{celula.prazoDias !== null ? ` · ${celula.prazoDias}d` : ''}</span>
                          {celula.vencedora && <span className="sr-only">Menor preço</span>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {comparacao.totais.length > 0 && (
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell className="font-semibold">Total por fornecedor</TableCell>
                {comparacao.totais.map(t => (
                  <TableCell key={t.fornecedor.id} className="text-right tabular-nums">
                    <span className="block font-semibold">{formatCurrency(t.totalCotado)}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t.cotouTudo ? 'cotou todos os itens' : `cotou ${t.itensCotados} de ${comparacao.linhas.length}`}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t.itensVencidos > 0 ? `pedido: ${formatCurrency(t.totalVencido)} (${t.itensVencidos} ${t.itensVencidos === 1 ? 'item' : 'itens'})` : 'sem pedido'}
                    </span>
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {comparacao.fornecedores.length === 0 && (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">Nenhuma proposta lançada. Escolha um fornecedor abaixo e informe os preços.</p>
      )}
    </section>
  );
}

function LancarProposta({ clinicaId, itens, propostas, fornecedores, onSalvo }: {
  clinicaId: string;
  itens: { id: string; descricao: string; quantidade: number; unidade: string | null; estoque_id?: string | null }[];
  propostas: { id: string; cotacao_item_id: string; fornecedor_id: string; preco_unitario: number; prazo_dias: number | null }[];
  fornecedores: Fornecedor[];
  onSalvo: () => void;
}) {
  const [fornecedorId, setFornecedorId] = useState('');
  const [valores, setValores] = useState<Record<string, { preco: string; prazo: string }>>({});
  const inicializadoPara = useRef<string | null>(null);
  const valoresIniciais = useRef<Record<string, { preco: string; prazo: string }>>({});
  const [confirmar, dialogoConfirmacao] = useConfirmacao();

  // Inicializa só ao trocar de fornecedor: um refetch das propostas não pode
  // apagar os preços que a pessoa está digitando.
  useEffect(() => {
    if (!fornecedorId) { inicializadoPara.current = null; valoresIniciais.current = {}; setValores({}); return; }
    if (inicializadoPara.current === fornecedorId) return;
    const inicial: Record<string, { preco: string; prazo: string }> = {};
    for (const item of itens) {
      const p = propostas.find(x => x.cotacao_item_id === item.id && x.fornecedor_id === fornecedorId);
      inicial[item.id] = { preco: p ? precoParaTexto(Number(p.preco_unitario)) : '', prazo: p?.prazo_dias != null ? String(p.prazo_dias) : '' };
    }
    inicializadoPara.current = fornecedorId;
    valoresIniciais.current = inicial;
    setValores(inicial);
  }, [fornecedorId, itens, propostas]);

  const alterado = Object.keys(valores).some(id => {
    const atual = valores[id];
    const inicial = valoresIniciais.current[id];
    return (atual?.preco ?? '') !== (inicial?.preco ?? '') || (atual?.prazo ?? '') !== (inicial?.prazo ?? '');
  });

  const trocarFornecedor = async (novo: string) => {
    if (novo === fornecedorId) return;
    if (alterado) {
      const ok = await confirmar({
        titulo: 'Descartar preços digitados?',
        descricao: 'Os preços lançados para este fornecedor ainda não foram salvos. Trocar de fornecedor descarta o que foi digitado.',
        confirmar: 'Descartar e trocar',
        variante: 'warning',
      });
      if (!ok) return;
    }
    setFornecedorId(novo);
  };

  // Último preço pago por item vinculado ao estoque (pedidos recebidos).
  const estoqueIds = useMemo(() => [...new Set(itens.map(i => i.estoque_id).filter((id): id is string => !!id))], [itens]);
  const ultimosPrecosQuery = useQuery({
    queryKey: ['compras', 'ultimo-preco', clinicaId, estoqueIds],
    enabled: estoqueIds.length > 0,
    meta: { suppressGlobalErrorToast: true },
    queryFn: async () => {
      const { data, error } = await supabase.from('pedido_compra_itens')
        .select('estoque_id, preco_unitario, created_at, pedidos_compra!inner(status, recebido_em)')
        .eq('clinica_id', clinicaId).in('estoque_id', estoqueIds).eq('pedidos_compra.status', 'recebido')
        .order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      const mapa = new Map<string, { preco: number; data: string | null }>();
      for (const linha of (data ?? []) as Array<{ estoque_id: string | null; preco_unitario: number; created_at: string; pedidos_compra?: { recebido_em?: string | null } | null }>) {
        if (linha.estoque_id && !mapa.has(linha.estoque_id)) mapa.set(linha.estoque_id, { preco: Number(linha.preco_unitario), data: linha.pedidos_compra?.recebido_em ?? linha.created_at });
      }
      return mapa;
    },
  });
  const ultimosPrecos = ultimosPrecosQuery.data ?? new Map<string, { preco: number; data: string | null }>();

  const invalidos = itens.filter(item => {
    const v = valores[item.id];
    if (!v) return false;
    const precoInvalido = v.preco.trim() !== '' && lerPreco(v.preco) === null;
    const prazoInvalido = v.prazo.trim() !== '' && !/^\d{1,3}$/.test(v.prazo.trim());
    return precoInvalido || prazoInvalido;
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const gravar = itens.flatMap(item => {
        const v = valores[item.id];
        const preco = v ? lerPreco(v.preco) : null;
        return preco === null ? [] : [{
          cotacao_item_id: item.id, fornecedor_id: fornecedorId, preco_unitario: preco,
          prazo_dias: v.prazo.trim() ? Number(v.prazo.trim()) : null,
        }];
      });
      const remover = propostas.filter(p => p.fornecedor_id === fornecedorId && !valores[p.cotacao_item_id]?.preco.trim()).map(p => p.id);
      if (gravar.length > 0) {
        const { error } = await supabase.from('cotacao_propostas').upsert(gravar, { onConflict: 'cotacao_item_id,fornecedor_id' });
        if (error) throw error;
      }
      if (remover.length > 0) {
        const { error } = await supabase.from('cotacao_propostas').delete().in('id', remover);
        if (error) throw error;
      }
      return gravar.length;
    },
    onSuccess: total => {
      valoresIniciais.current = valores;
      toast.success(total === 1 ? 'Proposta salva para 1 item.' : `Proposta salva para ${total} itens.`);
      onSalvo();
    },
    onError: erro => toast.error(mensagemErroCompras(erro)),
  });

  return (
    <section aria-label="Lançar proposta" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Lançar proposta</h3>
          <p className="text-xs text-muted-foreground">Escolha o fornecedor e informe o preço unitário de cada item. Deixe em branco o que ele não cotou.</p>
        </div>
        <div className="w-full sm:w-72">
          <Label htmlFor="proposta-fornecedor" className="sr-only">Fornecedor</Label>
          <Select value={fornecedorId} onValueChange={valor => { void trocarFornecedor(valor); }}>
            <SelectTrigger id="proposta-fornecedor" aria-label="Fornecedor da proposta"><SelectValue placeholder="Escolha o fornecedor" /></SelectTrigger>
            <SelectContent>
              {fornecedores.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {fornecedores.length === 0 && (
        <p className="text-sm text-muted-foreground">Cadastre um fornecedor na aba Fornecedores para lançar propostas.</p>
      )}
      {fornecedorId && (
        <>
          <Table>
            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="w-36">Preço unitário</TableHead><TableHead className="w-28">Prazo (dias)</TableHead></TableRow></TableHeader>
            <TableBody>
              {itens.map(item => {
                const ultimo = item.estoque_id ? ultimosPrecos.get(item.estoque_id) : undefined;
                const variacao = textoVariacao(variacaoPercentual(lerPreco(valores[item.id]?.preco ?? ''), ultimo?.preco));
                return (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className="font-medium">{item.descricao}</span> <span className="text-xs text-muted-foreground">· {item.quantidade} {item.unidade ?? ''}</span>
                    {ultimo && (
                      <span className="block text-[11px] text-muted-foreground">
                        Último preço pago: {formatCurrency(ultimo.preco)}{ultimo.data ? ` em ${formatarData(ultimo.data)}` : ''}{variacao ? ` · ${variacao}` : ''}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input aria-label={`Preço unitário de ${item.descricao}`} inputMode="decimal" placeholder="0,00" value={valores[item.id]?.preco ?? ''}
                      aria-invalid={invalidos.includes(item) || undefined}
                      onChange={e => setValores(atual => ({ ...atual, [item.id]: { prazo: atual[item.id]?.prazo ?? '', preco: e.target.value } }))} />
                  </TableCell>
                  <TableCell>
                    <Input aria-label={`Prazo de entrega de ${item.descricao}`} inputMode="numeric" placeholder="—" value={valores[item.id]?.prazo ?? ''}
                      onChange={e => setValores(atual => ({ ...atual, [item.id]: { preco: atual[item.id]?.preco ?? '', prazo: e.target.value } }))} />
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {invalidos.length > 0 && <p className="text-xs text-destructive">Confira o preço (ex.: 12,50) e o prazo (dias inteiros) de: {invalidos.map(i => i.descricao).join(', ')}.</p>}
          <div className="flex justify-end">
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || invalidos.length > 0}>{salvar.isPending ? 'Salvando...' : 'Salvar proposta'}</Button>
          </div>
        </>
      )}
      {dialogoConfirmacao}
    </section>
  );
}

// ─── Pedidos ────────────────────────────────────────────────────────────────

function AbaPedidos({ clinicaId, podeGerir, podeLancarConta }: { clinicaId: string; podeGerir: boolean; podeLancarConta: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [recemRecebido, setRecemRecebido] = useState<{ id: string; total: number | string; fornecedores?: { nome: string } | null } | null>(null);
  const [filtro, setFiltro] = useState<'todos' | SituacaoPedidoCompra>('todos');
  const [aberto, setAberto] = useState<string | null>(null);
  const [receber, setReceberState] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState<string | null>(null);
  const [estouros, setEstouros] = useState<EstouroMaximo[]>([]);
  const setReceber = (id: string | null) => { setEstouros([]); setReceberState(id); };
  const hoje = todaySaoPauloDateOnly();

  const pedidosQuery = useQuery({
    queryKey: ['compras', 'pedidos', clinicaId],
    queryFn: async () => {
      const { data, error } = await supabase.from('pedidos_compra')
        .select('id, status, total, created_at, recebido_em, fornecedor_id, cotacao_id, fornecedores(nome, telefone, email), cotacoes_compra(titulo), pedido_compra_itens(id, descricao, quantidade, preco_unitario, estoque_id)')
        .eq('clinica_id', clinicaId).order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  const pedidos = useMemo(() => pedidosQuery.data ?? [], [pedidosQuery.data]);
  const visiveis = filtro === 'todos' ? pedidos : pedidos.filter(p => p.status === filtro);
  const contagem = (s: SituacaoPedidoCompra) => pedidos.filter(p => p.status === s).length;

  // Previsão de entrega: dia da emissão + maior prazo cotado pelo fornecedor nos itens da cotação.
  const cotacaoIds = useMemo(() => [...new Set(pedidos.map(p => p.cotacao_id).filter((id): id is string => !!id))], [pedidos]);
  const prazosQuery = useQuery({
    queryKey: ['compras', 'prazos-pedidos', clinicaId, cotacaoIds],
    enabled: cotacaoIds.length > 0,
    meta: { suppressGlobalErrorToast: true },
    queryFn: async () => {
      const { data: itens, error } = await supabase.from('cotacao_itens').select('id, cotacao_id').in('cotacao_id', cotacaoIds);
      if (error) throw error;
      const cotacaoDoItem = new Map((itens ?? []).map(i => [i.id, i.cotacao_id]));
      if (cotacaoDoItem.size === 0) return new Map<string, number>();
      const { data: propostas, error: erroPropostas } = await supabase.from('cotacao_propostas')
        .select('cotacao_item_id, fornecedor_id, prazo_dias').in('cotacao_item_id', [...cotacaoDoItem.keys()]);
      if (erroPropostas) throw erroPropostas;
      const prazos = new Map<string, number>();
      for (const p of propostas ?? []) {
        if (p.prazo_dias == null) continue;
        const chave = `${cotacaoDoItem.get(p.cotacao_item_id)}:${p.fornecedor_id}`;
        prazos.set(chave, Math.max(prazos.get(chave) ?? 0, Number(p.prazo_dias)));
      }
      return prazos;
    },
  });
  const previsaoDe = (p: { cotacao_id: string | null; fornecedor_id: string; created_at: string }) =>
    previsaoEntrega(p.created_at, prazosQuery.data?.get(`${p.cotacao_id}:${p.fornecedor_id}`));

  // Contas a pagar já lançadas a partir de pedidos recebidos (número de documento PC-XXXXXXXX).
  const documentosRecebidos = useMemo(() => pedidos.filter(p => p.status === 'recebido').map(p => contaPagarDoPedido(p).numero_documento), [pedidos]);
  const contasQuery = useQuery({
    queryKey: ['compras', 'contas-lancadas', clinicaId, documentosRecebidos],
    enabled: documentosRecebidos.length > 0,
    meta: { suppressGlobalErrorToast: true },
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos').select('numero_documento')
        .eq('clinica_id', clinicaId).in('numero_documento', documentosRecebidos);
      if (error) throw error;
      return new Set((data ?? []).map(l => l.numero_documento).filter((d): d is string => !!d));
    },
  });
  const contaLancada = (p: { id: string; total: number | string }) => contasQuery.data?.has(contaPagarDoPedido(p).numero_documento) ?? false;

  const lancarConta = (p: { id: string; total: number | string; fornecedores?: { nome: string } | null }) =>
    navigate('/contas/pagar/nova', { state: { initial: contaPagarDoPedido(p) } });

  const enviarPedido = async (p: (typeof pedidos)[number], canal: 'pdf' | 'whatsapp' | 'email') => {
    const previsao = previsaoDe(p);
    const texto = textoPedidoCompra(p, { previsao });
    try {
      if (canal === 'pdf') { await baixarPdfPedidoCompra(p, { previsao }); return; }
      const fornecedor = p.fornecedores as { nome: string; telefone?: string | null; email?: string | null } | null;
      if (canal === 'whatsapp') {
        const link = linkWhatsApp(fornecedor?.telefone, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
        window.open(link, '_blank', 'noopener,noreferrer');
        if (!fornecedor?.telefone) toast.info('Fornecedor sem telefone cadastrado: escolha o contato no WhatsApp.');
        return;
      }
      window.location.href = linkEmailPedido(fornecedor?.email, p, texto);
      if (!fornecedor?.email) toast.info('Fornecedor sem e-mail cadastrado: informe o destinatário no seu e-mail.');
    } catch (erro) {
      toast.error('Não foi possível gerar o pedido.', { description: mensagemDeErro(erro) });
    }
  };

  const receberMutation = useMutation({
    mutationFn: async ({ id, ajustarMaximo }: { id: string; ajustarMaximo: boolean }) => {
      const pedido = pedidos.find(p => p.id === id);
      const vinculados = (pedido?.pedido_compra_itens ?? []).filter(i => i.estoque_id);
      if (vinculados.length > 0) {
        // O recebimento falha se um item passar do estoque máximo: confere antes.
        const { data: saldos, error } = await supabase.from('estoque').select('id, nome, quantidade, quantidade_maxima')
          .eq('clinica_id', clinicaId).in('id', vinculados.map(i => i.estoque_id!));
        if (error) throw error;
        const lista = calcularEstouros(vinculados, saldos ?? []);
        if (lista.length > 0 && !ajustarMaximo) return { estouros: lista };
        for (const e of lista) {
          const { data, error: erroAjuste } = await supabase.from('estoque').update({ quantidade_maxima: e.novoMaximo })
            .eq('id', e.id).eq('clinica_id', clinicaId).select('id');
          if (erroAjuste) throw erroAjuste;
          if (!data || data.length === 0) throw new Error(`Não foi possível ajustar o máximo de ${e.nome}. Ajuste no cadastro do estoque.`);
        }
      }
      const { data, error } = await supabase.rpc('receber_pedido_compra', { p_pedido_id: id });
      if (error) throw error;
      return { resultado: data as { ja_recebido?: boolean; entradas?: number } | null };
    },
    onSuccess: (retorno, { id }) => {
      if ('estouros' in retorno) { setEstouros(retorno.estouros ?? []); return; }
      const resultado = retorno.resultado;
      const pedido = pedidos.find(p => p.id === id);
      if (pedido && !resultado?.ja_recebido) setRecemRecebido(pedido);
      toast.success(resultado?.ja_recebido ? 'Este pedido já estava recebido.' : `Pedido recebido. ${resultado?.entradas ?? 0} ${resultado?.entradas === 1 ? 'item entrou' : 'itens entraram'} no estoque.`);
      setReceber(null);
      void queryClient.invalidateQueries({ queryKey: ['compras'] });
      void queryClient.invalidateQueries({ queryKey: ['estoque'] });
    },
    onError: erro => toast.error(mensagemErroCompras(erro)),
  });

  const cancelarMutation = useMutation({
    mutationFn: async (id: string) => {
      // Só cancela pedido desta clínica que ainda esteja emitido (não recebido nem já cancelado).
      const { data, error } = await supabase.from('pedidos_compra').update({ status: 'cancelado' })
        .eq('id', id).eq('clinica_id', clinicaId).eq('status', 'emitido').select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('O pedido já foi recebido ou cancelado em outra sessão. Atualize a lista.');
    },
    onSuccess: () => { toast.success('Pedido cancelado.'); setCancelar(null); void queryClient.invalidateQueries({ queryKey: ['compras'] }); },
    onError: erro => toast.error(mensagemErroCompras(erro)),
  });

  if (pedidosQuery.isError) return <ErrorState title="Não foi possível carregar os pedidos" error={pedidosQuery.error} onRetry={() => void pedidosQuery.refetch()} />;

  const pedidoReceber = pedidos.find(p => p.id === receber);
  const itensComEstoque = pedidoReceber?.pedido_compra_itens.filter(i => i.estoque_id).length ?? 0;

  const filtros: { key: typeof filtro; label: string; valor: number }[] = [
    { key: 'todos', label: 'Todos', valor: pedidos.length },
    { key: 'emitido', label: 'A receber', valor: contagem('emitido') },
    { key: 'recebido', label: 'Recebidos', valor: contagem('recebido') },
    { key: 'cancelado', label: 'Cancelados', valor: contagem('cancelado') },
  ];

  return (
    <section aria-label="Pedidos de compra" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Pedidos de compra</h2>
        <div className="flex flex-wrap gap-1">
          {filtros.map(f => (
            <button key={f.key} type="button" aria-pressed={filtro === f.key} onClick={() => setFiltro(f.key)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filtro === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
              {f.label} · {f.valor}
            </button>
          ))}
        </div>
      </div>
      {recemRecebido && (
        <div role="status" className="flex flex-col gap-2 border-b border-border bg-success/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            Pedido nº {numeroPedidoCompra(recemRecebido.id)} recebido ({formatCurrency(Number(recemRecebido.total))}).
            {podeLancarConta ? ' Lance a conta a pagar do fornecedor para não esquecer o pagamento.' : ' Avise o financeiro para lançar a conta a pagar do fornecedor.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRecemRecebido(null)}>Dispensar</Button>
            {podeLancarConta && (
              <Button size="sm" onClick={() => lancarConta(recemRecebido)}>
                Lançar conta a pagar
              </Button>
            )}
          </div>
        </div>
      )}
      {pedidosQuery.isLoading ? <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
        : visiveis.length === 0 ? (
          <EmptyState className="m-4" icon={Package} title={pedidos.length === 0 ? 'Nenhum pedido emitido' : 'Nenhum pedido nesta situação'}
            description={pedidos.length === 0 ? 'Os pedidos nascem de uma cotação: lance as propostas e use Gerar pedidos com menor preço.' : 'Escolha outro filtro para ver os demais pedidos.'} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><span className="sr-only">Itens</span></TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Cotação</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map(p => {
                  const expandido = aberto === p.id;
                  const previsao = previsaoDe(p);
                  const atrasado = pedidoAtrasado(previsao, p.status, hoje);
                  const lancada = p.status === 'recebido' && contaLancada(p);
                  return [
                    <TableRow key={p.id}>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-expanded={expandido} aria-label={expandido ? 'Ocultar itens' : 'Ver itens'} onClick={() => setAberto(expandido ? null : p.id)}>
                          {expandido ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{p.fornecedores?.nome ?? 'Fornecedor'}</TableCell>
                      <TableCell className="text-muted-foreground">{p.cotacoes_compra?.titulo ?? '—'}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(Number(p.total))}</TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1">
                          <Situacao tom={tomPedido(p.status)}>{ROTULO_SITUACAO_PEDIDO[p.status as SituacaoPedidoCompra] ?? p.status}</Situacao>
                          {atrasado && <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Atrasado</span>}
                          {lancada && <Situacao tom="neutro">Conta lançada</Situacao>}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.status === 'recebido' ? `Recebido em ${formatarData(p.recebido_em)}` : formatarData(p.created_at)}
                        {p.status === 'emitido' && previsao && <span className={cn('block text-[11px]', atrasado && 'font-medium text-destructive')}>Previsão {formatarData(`${previsao}T12:00:00Z`)}</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {p.status !== 'cancelado' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" className="gap-1.5 rounded-full" aria-label={`Enviar pedido de ${p.fornecedores?.nome ?? 'fornecedor'}`}>
                                  <Send aria-hidden="true" className="h-3.5 w-3.5" />Enviar
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => void enviarPedido(p, 'pdf')}>Baixar PDF</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => void enviarPedido(p, 'whatsapp')}>Enviar por WhatsApp</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => void enviarPedido(p, 'email')}>Enviar por e-mail</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {podeLancarConta && p.status === 'recebido' && !lancada && (
                            <Button size="sm" variant="outline" className="rounded-full" onClick={() => lancarConta(p)}>Lançar conta</Button>
                          )}
                          {podeGerir && p.status === 'emitido' && (
                            <>
                              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCancelar(p.id)}>Cancelar</Button>
                              <Button size="sm" className="gap-1.5" onClick={() => setReceber(p.id)}><PackageCheck className="h-3.5 w-3.5" />Receber pedido</Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>,
                    expandido && (
                      <TableRow key={`${p.id}-itens`} className="bg-muted/20 hover:bg-muted/20">
                        <TableCell />
                        <TableCell colSpan={6}>
                          <ul className="divide-y divide-border text-sm">
                            {p.pedido_compra_itens.map(i => (
                              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                                <span>{i.descricao} <span className="text-xs text-muted-foreground">· {i.quantidade} × {formatCurrency(Number(i.preco_unitario))}{i.estoque_id ? '' : ' · sem vínculo com o estoque'}</span></span>
                                <span className="tabular-nums">{formatCurrency(Math.round(i.quantidade * Number(i.preco_unitario) * 100) / 100)}</span>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    ),
                  ];
                })}
              </TableBody>
            </Table>
          </div>
        )}

      <ConfirmDialog open={!!receber} onOpenChange={open => { if (!open && !receberMutation.isPending) setReceber(null); }} title="Receber pedido"
        description={`Confirme que os itens de ${pedidoReceber?.fornecedores?.nome ?? 'este fornecedor'} chegaram. ${itensComEstoque} ${itensComEstoque === 1 ? 'item vinculado entra' : 'itens vinculados entram'} no estoque agora; o recebimento não pode ser desfeito.`}
        confirmLabel={estouros.length > 0 ? 'Ajustar máximo e receber' : 'Confirmar recebimento'}
        variant={estouros.length > 0 ? 'warning' : 'default'}
        onConfirm={() => receber && receberMutation.mutate({ id: receber, ajustarMaximo: estouros.length > 0 })} isLoading={receberMutation.isPending} closeOnConfirm={false}>
        {estouros.length > 0 && (
          <div role="alert" className="space-y-1 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            <p className="font-medium">Estes itens passam do estoque máximo cadastrado:</p>
            <ul className="list-disc pl-5 text-xs">
              {estouros.map(e => <li key={e.id}>{e.nome}: saldo {e.saldo} + {e.entrada} = {e.saldo + e.entrada} (máximo {e.maximo}). Novo máximo: {e.novoMaximo}.</li>)}
            </ul>
            <p className="text-xs text-muted-foreground">Ajuste o máximo para receber agora, ou cancele e revise o cadastro no estoque.</p>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog open={!!cancelar} onOpenChange={open => { if (!open) setCancelar(null); }} title="Cancelar pedido"
        description="O pedido deixa de poder ser recebido. Esta ação não pode ser desfeita."
        confirmLabel="Cancelar pedido" variant="destructive" onConfirm={() => cancelar && cancelarMutation.mutate(cancelar)} isLoading={cancelarMutation.isPending} closeOnConfirm={false} />
    </section>
  );
}

// ─── Fornecedores ───────────────────────────────────────────────────────────

const fornecedorVazio = { nome: '', cnpj: '', contato: '', telefone: '', email: '' };

function AbaFornecedores({ clinicaId, podeGerir, query }: {
  clinicaId: string; podeGerir: boolean;
  query: { data?: Fornecedor[]; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
}) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<string | 'novo' | null>(null);
  const [form, setForm] = useState(fornecedorVazio);
  const [excluir, setExcluir] = useState<Fornecedor | null>(null);
  const fornecedores = useMemo(() => query.data ?? [], [query.data]);

  const filtrados = useMemo(() => {
    const q = normalizarBusca(busca);
    const digitos = normalizarCnpj(busca);
    return fornecedores.filter(f => !q || [f.nome, f.contato, f.email, f.telefone].some(v => normalizarBusca(v).includes(q))
      || (digitos.length >= 3 && (f.cnpj ?? '').includes(digitos)));
  }, [fornecedores, busca]);

  const abrir = (f: Fornecedor | null) => {
    setEditando(f ? f.id : 'novo');
    setForm(f ? { nome: f.nome, cnpj: formatarCnpj(f.cnpj), contato: f.contato ?? '', telefone: f.telefone ?? '', email: f.email ?? '' } : fornecedorVazio);
  };

  const cnpjDigitos = normalizarCnpj(form.cnpj);
  const cnpjInvalido = cnpjDigitos.length > 0 && cnpjDigitos.length !== 14;
  const emailInvalido = !!form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const invalidar = () => void queryClient.invalidateQueries({ queryKey: ['compras', 'fornecedores', clinicaId] });

  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        nome: form.nome.trim(), cnpj: cnpjDigitos || null, contato: form.contato.trim() || null,
        telefone: form.telefone.trim() || null, email: form.email.trim() || null,
      };
      const escrita = editando === 'novo'
        ? supabase.from('fornecedores').insert({ ...dados, clinica_id: clinicaId })
        : supabase.from('fornecedores').update(dados).eq('id', editando!).eq('clinica_id', clinicaId);
      const { error } = await escrita;
      if (error) {
        if (error.code === '23505') throw new Error('Já existe um fornecedor com este CNPJ.');
        throw error;
      }
    },
    onSuccess: () => { toast.success('Fornecedor salvo.'); setEditando(null); invalidar(); },
    onError: erro => toast.error(mensagemErroCompras(erro)),
  });

  const alternarAtivo = useMutation({
    mutationFn: async (f: Fornecedor) => {
      const { error } = await supabase.from('fornecedores').update({ ativo: !f.ativo }).eq('id', f.id).eq('clinica_id', clinicaId);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: erro => toast.error(mensagemErroCompras(erro)),
  });

  const excluirMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fornecedores').delete().eq('id', id).eq('clinica_id', clinicaId);
      if (error) {
        if (error.code === '23503') throw new Error('Este fornecedor já tem propostas ou pedidos. Inative-o em vez de excluir.');
        throw error;
      }
    },
    onSuccess: () => { toast.success('Fornecedor excluído.'); setExcluir(null); if (editando === excluir?.id) setEditando(null); invalidar(); },
    onError: erro => { toast.error(mensagemErroCompras(erro)); setExcluir(null); },
  });

  if (query.isError) return <ErrorState title="Não foi possível carregar os fornecedores" error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className={cn('grid gap-4', editando && 'lg:grid-cols-[1fr_minmax(300px,380px)]')}>
      <section aria-label="Fornecedores" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold">Fornecedores <span className="font-normal text-muted-foreground">· {fornecedores.length}</span></h2>
          <div className="flex gap-2">
            <div className="relative w-full sm:w-64">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Buscar fornecedor" className="h-9 pl-9" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, CNPJ ou contato" />
            </div>
            {podeGerir && <Button className="h-9 shrink-0 gap-1.5" onClick={() => abrir(null)}><Plus className="h-4 w-4" />Novo fornecedor</Button>}
          </div>
        </div>
        {query.isLoading ? <div className="p-4"><TableSkeleton rows={5} cols={5} /></div>
          : fornecedores.length === 0 ? (
            <EmptyState className="m-4" icon={Building2} title="Nenhum fornecedor cadastrado"
              description="Cadastre os fornecedores para lançar as propostas das cotações."
              action={podeGerir ? { label: 'Novo fornecedor', onClick: () => abrir(null), icon: Plus } : undefined} />
          ) : filtrados.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum fornecedor encontrado para “{busca}”.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Nome</TableHead><TableHead>CNPJ</TableHead><TableHead>Contato</TableHead><TableHead>Situação</TableHead>{podeGerir && <TableHead className="text-right">Ações</TableHead>}</TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map(f => (
                    <TableRow key={f.id} className={cn(editando === f.id && 'bg-primary/5')}>
                      <TableCell className="font-medium">{f.nome}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{f.cnpj ? formatarCnpj(f.cnpj) : '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{[f.contato, f.telefone, f.email].filter(Boolean).join(' · ') || '—'}</TableCell>
                      <TableCell><Situacao tom={f.ativo ? 'neutro' : 'apagado'}>{f.ativo ? 'Ativo' : 'Inativo'}</Situacao></TableCell>
                      {podeGerir && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => abrir(f)}>Editar</Button>
                            <Button size="sm" variant="ghost" onClick={() => alternarAtivo.mutate(f)} disabled={alternarAtivo.isPending}>{f.ativo ? 'Inativar' : 'Reativar'}</Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Excluir ${f.nome}`} onClick={() => setExcluir(f)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      </section>

      {editando && podeGerir && (
        <section aria-label={editando === 'novo' ? 'Novo fornecedor' : 'Editar fornecedor'} className="space-y-3 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{editando === 'novo' ? 'Novo fornecedor' : 'Editar fornecedor'}</h2>
            <Button variant="ghost" size="icon" aria-label="Fechar formulário" onClick={() => setEditando(null)}><X className="h-4 w-4" /></Button>
          </div>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); salvar.mutate(); }}>
            <div className="space-y-1.5"><Label htmlFor="fornecedor-nome">Nome</Label><Input id="fornecedor-nome" required maxLength={200} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="fornecedor-cnpj">CNPJ (opcional)</Label>
              <Input id="fornecedor-cnpj" inputMode="numeric" value={form.cnpj} aria-invalid={cnpjInvalido || undefined} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              {cnpjInvalido && <p className="text-xs text-destructive">O CNPJ tem 14 dígitos.</p>}
            </div>
            <div className="space-y-1.5"><Label htmlFor="fornecedor-contato">Contato</Label><Input id="fornecedor-contato" maxLength={200} value={form.contato} onChange={e => setForm({ ...form, contato: e.target.value })} placeholder="Nome de quem atende" /></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="fornecedor-telefone">Telefone</Label><Input id="fornecedor-telefone" inputMode="tel" maxLength={40} value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label htmlFor="fornecedor-email">E-mail</Label>
                <Input id="fornecedor-email" type="email" maxLength={254} value={form.email} aria-invalid={emailInvalido || undefined} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEditando(null)} disabled={salvar.isPending}>Cancelar</Button>
              <Button type="submit" disabled={salvar.isPending || form.nome.trim().length < 2 || cnpjInvalido || emailInvalido}>{salvar.isPending ? 'Salvando...' : 'Salvar fornecedor'}</Button>
            </div>
          </form>
        </section>
      )}

      <ConfirmDialog open={!!excluir} onOpenChange={open => { if (!open) setExcluir(null); }} title="Excluir fornecedor"
        description={`Excluir ${excluir?.nome ?? 'o fornecedor'}? Fornecedores com propostas ou pedidos não podem ser excluídos; inative-os.`}
        confirmLabel="Excluir" variant="destructive" onConfirm={() => excluir && excluirMutation.mutate(excluir.id)} isLoading={excluirMutation.isPending} closeOnConfirm={false} />
    </div>
  );
}
