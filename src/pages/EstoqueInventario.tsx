import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { cn } from '@/lib/utils';
import { mensagemDeErro } from '@/lib/erros';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import {
  CATEGORIAS_ESTOQUE, ajustesInventario, rotuloCategoriaEstoque, rotuloUnidadeEstoque, type AjusteInventario,
} from '@/lib/estoqueOperacao';

interface ItemInventario {
  id: string; nome: string; categoria: string; unidade: string | null; quantidade: number;
  localizacao: string | null; lote: string | null;
}

const normalizar = (valor: unknown) => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();

/**
 * Inventário físico: a equipe conta o que há na prateleira, o sistema mostra a
 * diferença e grava um ajuste (entrada ou saída) com motivo para cada item que
 * não bate. Itens cujo saldo mudou durante a contagem são pulados.
 */
export default function EstoqueInventario() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id ?? null;
  const completed = useRef(false);
  const chaves = useRef<Record<string, string>>({});
  const saldoNaContagem = useRef<Record<string, number>>({});
  const hojeIso = todaySaoPauloDateOnly();
  const hojeBr = `${hojeIso.slice(8, 10)}/${hojeIso.slice(5, 7)}/${hojeIso.slice(0, 4)}`;

  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState(`Inventário físico de ${hojeBr}`);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todos');
  const [soDivergentes, setSoDivergentes] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const query = useSupabaseQuery<ItemInventario>('estoque', {
    select: 'id, nome, categoria, unidade, quantidade, localizacao, lote',
    orderBy: { column: 'nome', ascending: true },
    filters: [{ column: 'clinica_id', operator: 'eq', value: clinicaId }],
    enabled: !!clinicaId,
  });
  const itens = useMemo(() => query.data ?? [], [query.data]);
  const ajustes = useMemo(() => ajustesInventario(itens, contagens), [itens, contagens]);
  const contados = Object.values(contagens).filter(v => v.trim() !== '').length;
  const invalidos = itens.filter(item => (contagens[item.id] ?? '').trim() !== '' && !/^\d+$/.test(contagens[item.id].trim()));

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    const divergentes = new Set(ajustes.map(a => a.id));
    return itens.filter(item => (categoria === 'todos' || item.categoria === categoria)
      && (!termo || [item.nome, item.localizacao, item.lote].some(v => normalizar(v).includes(termo)))
      && (!soDivergentes || divergentes.has(item.id)));
  }, [itens, busca, categoria, soDivergentes, ajustes]);

  const alterarContagem = (item: ItemInventario, valor: string) => {
    if (saldoNaContagem.current[item.id] === undefined) saldoNaContagem.current[item.id] = Number(item.quantidade);
    setContagens(atual => ({ ...atual, [item.id]: valor }));
  };

  const aplicar = async () => {
    if (!clinicaId || aplicando || ajustes.length === 0) return;
    setAplicando(true);
    const aplicados: AjusteInventario[] = [];
    const pulados: string[] = [];
    const puladosIds: string[] = [];
    try {
      const { data: atuais, error } = await supabase.from('estoque').select('id, quantidade')
        .eq('clinica_id', clinicaId).in('id', ajustes.map(a => a.id));
      if (error) throw error;
      const saldoAtual = new Map((atuais ?? []).map(item => [item.id, Number(item.quantidade)]));
      for (const ajuste of ajustes) {
        const base = saldoNaContagem.current[ajuste.id] ?? ajuste.sistema;
        if (saldoAtual.get(ajuste.id) !== base) { pulados.push(`${ajuste.nome} (saldo mudou durante a contagem)`); puladosIds.push(ajuste.id); continue; }
        chaves.current[ajuste.id] ??= crypto.randomUUID();
        const { data, error: rpcError } = await (supabase as any).rpc('registrar_movimentacao_estoque', {
          p_item_id: ajuste.id,
          p_tipo: ajuste.tipo,
          p_quantidade: Math.abs(ajuste.diferenca),
          p_motivo: `Ajuste de inventário: ${motivo.trim()} (sistema ${base}, contado ${ajuste.contado})`.slice(0, 300),
          p_chave_idempotencia: chaves.current[ajuste.id],
        });
        if (rpcError) { pulados.push(`${ajuste.nome} (${mensagemDeErro(rpcError)})`); continue; }
        if (!Number.isInteger(data)) { pulados.push(`${ajuste.nome} (o servidor não confirmou o saldo)`); continue; }
        aplicados.push(ajuste);
      }
      await queryClient.invalidateQueries({ queryKey: ['estoque'] });
      if (aplicados.length > 0) toast.success(`${aplicados.length} ${aplicados.length === 1 ? 'ajuste registrado' : 'ajustes registrados'} no histórico.`);
      if (pulados.length > 0) toast.warning(`${pulados.length} ${pulados.length === 1 ? 'item não foi ajustado' : 'itens não foram ajustados'}. Conte de novo.`, { description: pulados.join(' • '), duration: 10000 });
      setContagens(atual => {
        const resto = { ...atual };
        for (const a of aplicados) { delete resto[a.id]; delete saldoNaContagem.current[a.id]; delete chaves.current[a.id]; }
        // Saldo mudou durante a contagem: limpa para contar de novo sobre o saldo novo.
        for (const id of puladosIds) { delete resto[id]; delete saldoNaContagem.current[id]; }
        return resto;
      });
      setConfirmar(false);
      if (pulados.length === 0) { completed.current = true; navigate('/estoque'); }
    } catch (error) {
      toast.error('Não foi possível aplicar o inventário.', { description: mensagemDeErro(error) });
    } finally {
      setAplicando(false);
    }
  };

  if (!clinicaId) return <ErrorState title="Clínica não identificada" description="O inventário não pode ser feito sem identificar a clínica atual." />;

  return (
    <main className="mx-auto max-w-5xl space-y-5 pb-24 lg:pb-8">
      <UnsavedChangesGuard dirty={contados > 0} busy={aplicando} completed={completed} />
      <Button variant="outline" onClick={() => navigate('/estoque')} disabled={aplicando}>Voltar ao estoque</Button>
      <PageHeader title="Inventário do estoque" description="Conte o que há em cada local, confira as diferenças e registre os ajustes com motivo." icon={<ClipboardList />} />

      {query.isError && !query.data ? (
        <ErrorState title="Não foi possível carregar o estoque" error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <div className="rounded-xl border border-border bg-card p-4"><TableSkeleton rows={6} cols={3} /></div>
      ) : (
        <>
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="inventario-motivo">Motivo dos ajustes *</Label>
                <Input id="inventario-motivo" maxLength={150} value={motivo} onChange={e => setMotivo(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button className="w-full md:w-auto" disabled={ajustes.length === 0 || invalidos.length > 0 || !motivo.trim() || aplicando} onClick={() => setConfirmar(true)}>
                  Registrar ajustes ({ajustes.length})
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {contados} de {itens.length} {itens.length === 1 ? 'item contado' : 'itens contados'} · {ajustes.length} com diferença.
              Deixe em branco o que não foi contado: ele não é alterado.
            </p>
            {invalidos.length > 0 && <p role="alert" className="text-xs text-destructive">Use números inteiros na contagem de: {invalidos.map(i => i.nome).join(', ')}.</p>}
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Buscar no inventário" className="h-10 rounded-full pl-9" placeholder="Produto, local ou lote" value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger aria-label="Filtrar por categoria" className="h-10 w-full rounded-full sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as categorias</SelectItem>
                {CATEGORIAS_ESTOQUE.map(c => <SelectItem key={c} value={c}>{rotuloCategoriaEstoque(c)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" aria-pressed={soDivergentes} onClick={() => setSoDivergentes(v => !v)}
              className={cn('h-10 rounded-full', soDivergentes && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>
              Só com diferença
            </Button>
          </div>

          <ul aria-label="Itens do inventário" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {visiveis.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum item corresponde aos filtros.</li>}
            {visiveis.map(item => {
              const ajuste = ajustes.find(a => a.id === item.id);
              const unidade = rotuloUnidadeEstoque(item.unidade || 'unidade');
              return (
                <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">{item.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {rotuloCategoriaEstoque(item.categoria)}{item.localizacao ? ` · ${item.localizacao}` : ''}{item.lote ? ` · lote ${item.lote}` : ''} · sistema: <span className="tabular-nums">{item.quantidade}</span> {unidade}
                    </p>
                    {ajuste && (
                      <p className="text-xs font-medium text-foreground">
                        Diferença: {ajuste.diferenca > 0 ? '+' : ''}{ajuste.diferenca} {unidade} ({ajuste.tipo === 'entrada' ? 'entrada' : 'saída'} de ajuste)
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:w-40">
                    <Label htmlFor={`contagem-${item.id}`} className="sr-only">Contagem de {item.nome}</Label>
                    <Input id={`contagem-${item.id}`} inputMode="numeric" placeholder="Contado" className="h-11"
                      value={contagens[item.id] ?? ''} onChange={e => alterarContagem(item, e.target.value)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ConfirmDialog open={confirmar} onOpenChange={aberto => { if (!aplicando) setConfirmar(aberto); }} title="Registrar ajustes de inventário"
        description={`${ajustes.length} ${ajustes.length === 1 ? 'item terá o saldo ajustado' : 'itens terão o saldo ajustado'} para a contagem física, com o motivo "${motivo.trim()}". Cada ajuste fica no histórico do produto.`}
        confirmLabel="Registrar ajustes" onConfirm={() => void aplicar()} isLoading={aplicando} closeOnConfirm={false} />
    </main>
  );
}
