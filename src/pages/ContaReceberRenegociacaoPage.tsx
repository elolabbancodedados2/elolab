import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { isValidDateOnly, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { formatWithDatePreference } from '@/lib/datePreference';
import { formatMoneyInput, formatarMoeda, parseMoneyInput } from '@/lib/dinheiro';
import { mensagemDeErro } from '@/lib/erros';
import { invalidarFinanceiro } from '@/lib/invalidarFinanceiro';
import { calcularRenegociacao, type ContaRenegociavel } from '@/lib/renegociacao';

interface Rascunho {
  descricao: string;
  valor: string;
  vencimento: string;
  desconto: string;
  acrescimo: string;
  motivo: string;
}

const MIN_MOTIVO = 5;

const rascunhoDaConta = (conta: ContaRenegociavel): Rascunho => ({
  descricao: conta.descricao ?? '',
  valor: formatMoneyInput(Number(conta.valor) || 0),
  vencimento: conta.data_vencimento ?? '',
  desconto: formatMoneyInput(Number(conta.desconto) || 0),
  acrescimo: formatMoneyInput(Number(conta.acrescimo) || 0),
  motivo: '',
});

const dataBr = (valor: string | null | undefined) => {
  const data = valor ? parseDateOnly(valor) : null;
  return data ? formatWithDatePreference(data, 'dd/MM/yyyy') : '—';
};

/** Renegociar uma conta a receber em aberto: vencimento, valor, desconto e acréscimo, com motivo registrado. */
export default function ContaReceberRenegociacaoPage() {
  const { lancamentoId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id ?? null;
  const routeState = location.state as { returnTo?: unknown; restoreSearchTerm?: unknown; restoreFilterCategoria?: unknown } | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/contas(?:\?.*)?$/.test(routeState.returnTo)
    ? routeState.returnTo : '/contas?tab=receber';
  const returnState = {
    restoreSearchTerm: typeof routeState?.restoreSearchTerm === 'string' ? routeState.restoreSearchTerm : '',
    restoreFilterCategoria: typeof routeState?.restoreFilterCategoria === 'string' ? routeState.restoreFilterCategoria : 'todas',
  };
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [inicial, setInicial] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const navegacaoLiberada = useRef(false);

  const contaQuery = useQuery({
    queryKey: ['receivable-detail', clinicaId, lancamentoId, 'renegociacao'],
    enabled: Boolean(clinicaId && lancamentoId),
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos')
        .select('id, descricao, valor, valor_pago, desconto, acrescimo, data_vencimento, status, observacoes')
        .eq('id', lancamentoId).eq('clinica_id', clinicaId!).eq('tipo', 'receita').maybeSingle();
      if (error) throw error;
      return data as ContaRenegociavel | null;
    },
  });
  const conta = contaQuery.data;

  useEffect(() => {
    if (!conta || rascunho) return;
    const base = rascunhoDaConta(conta);
    setRascunho(base);
    setInicial(base);
  }, [conta, rascunho]);

  const alterado = Boolean(rascunho && inicial && JSON.stringify(rascunho) !== JSON.stringify(inicial));
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !navegacaoLiberada.current && alterado && !salvando && currentLocation.pathname !== nextLocation.pathname);

  const resultado = useMemo(() => (conta && rascunho
    ? calcularRenegociacao(conta, {
      descricao: rascunho.descricao,
      valor: parseMoneyInput(rascunho.valor),
      vencimento: rascunho.vencimento,
      desconto: rascunho.desconto.trim() ? parseMoneyInput(rascunho.desconto) : 0,
      acrescimo: rascunho.acrescimo.trim() ? parseMoneyInput(rascunho.acrescimo) : 0,
      motivo: rascunho.motivo,
    }, { hoje: todaySaoPauloDateOnly(), autor: profile?.nome ?? null })
    : null), [conta, rascunho, profile?.nome]);

  const voltar = () => navigate(returnTo, { state: returnState });
  const atualizar = (patch: Partial<Rascunho>) => {
    setRascunho(atual => (atual ? { ...atual, ...patch } : atual));
    setErro('');
  };

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (salvando || !conta || !clinicaId || !resultado) return;
    if (!resultado.ok) { setErro(resultado.erro); return; }
    setSalvando(true);
    try {
      const { data, error } = await supabase.from('lancamentos')
        .update(resultado.alteracoes)
        .eq('id', conta.id)
        .eq('clinica_id', clinicaId)
        .eq('tipo', 'receita')
        .eq('status', conta.status)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('A conta mudou enquanto você editava (pagamento ou cancelamento). Atualize e tente novamente.');
      toast.success('Conta renegociada.');
      void invalidarFinanceiro(queryClient);
      navegacaoLiberada.current = true;
      navigate(returnTo, { replace: true, state: returnState });
    } catch (e) {
      setErro(mensagemDeErro(e));
      void invalidarFinanceiro(queryClient);
    } finally {
      setSalvando(false);
    }
  };

  const acaoVoltar = <Button type="button" variant="outline" onClick={voltar} disabled={salvando}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar às contas a receber</Button>;

  if (contaQuery.isLoading) return <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6" aria-busy="true"><Skeleton className="h-10 w-64" /><Skeleton className="h-80" /></div>;
  if (contaQuery.isError) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Não foi possível carregar a conta" error={contaQuery.error} onRetry={() => void contaQuery.refetch()} /></div>;
  if (!conta || !rascunho || !['pendente', 'parcial', 'atrasado'].includes(conta.status)) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
        <PageHeader title="Renegociar conta a receber" icon={<Pencil />} actions={acaoVoltar} />
        <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {conta ? 'Só contas em aberto podem ser renegociadas. Esta já foi quitada ou cancelada.' : 'A conta não existe ou não pertence à clínica ativa.'}
        </p>
      </div>
    );
  }

  const comPagamento = Number(conta.valor_pago || 0) > 0;
  const motivoCurto = rascunho.motivo.trim().length < MIN_MOTIVO;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
      <PageHeader title="Renegociar conta a receber" description="Ajuste vencimento e valores de uma conta em aberto. O motivo fica registrado nas observações." icon={<Pencil />} actions={acaoVoltar} />

      <section aria-label="Situação atual" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="break-words font-semibold text-foreground">{conta.descricao}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Valor</dt><dd className="font-medium tabular-nums">{formatarMoeda(conta.valor)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Já recebido</dt><dd className="font-medium tabular-nums">{formatarMoeda(conta.valor_pago)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Vencimento</dt><dd className="font-medium">{dataBr(conta.data_vencimento)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Saldo atual</dt><dd className="font-semibold tabular-nums">{formatarMoeda(resultado?.saldoAtual ?? 0)}</dd></div>
        </dl>
      </section>

      <form onSubmit={salvar} className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
        <fieldset disabled={salvando} className="space-y-5 border-0 p-0">
          <div className="space-y-1.5">
            <Label htmlFor="renegociar-descricao">Descrição</Label>
            <Input id="renegociar-descricao" value={rascunho.descricao} maxLength={300} onChange={e => atualizar({ descricao: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="renegociar-vencimento">Novo vencimento</Label>
              <Input id="renegociar-vencimento" type="date" value={rascunho.vencimento} onChange={e => atualizar({ vencimento: e.target.value })}
                aria-invalid={Boolean(rascunho.vencimento) && !isValidDateOnly(rascunho.vencimento)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="renegociar-valor">Valor da conta</Label>
              <Input id="renegociar-valor" inputMode="decimal" value={rascunho.valor} disabled={comPagamento} aria-describedby="renegociar-valor-ajuda"
                onChange={e => atualizar({ valor: e.target.value })} />
              <p id="renegociar-valor-ajuda" className="text-xs text-muted-foreground">
                {comPagamento ? 'Com pagamento registrado, ajuste o saldo por desconto ou acréscimo.' : 'Valor original, antes de desconto e acréscimo.'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="renegociar-desconto">Desconto</Label>
              <Input id="renegociar-desconto" inputMode="decimal" value={rascunho.desconto} onChange={e => atualizar({ desconto: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="renegociar-acrescimo">Acréscimo (juros ou multa)</Label>
              <Input id="renegociar-acrescimo" inputMode="decimal" value={rascunho.acrescimo} onChange={e => atualizar({ acrescimo: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="renegociar-motivo">Motivo da renegociação *</Label>
            <Textarea id="renegociar-motivo" rows={3} maxLength={500} value={rascunho.motivo} aria-describedby="renegociar-motivo-ajuda"
              placeholder="Ex.: paciente pediu para pagar no próximo mês" onChange={e => atualizar({ motivo: e.target.value })} />
            <p id="renegociar-motivo-ajuda" className={motivoCurto && rascunho.motivo.trim() ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {motivoCurto ? `Pelo menos ${MIN_MOTIVO} caracteres (faltam ${MIN_MOTIVO - rascunho.motivo.trim().length}).` : `${rascunho.motivo.length}/500`}
            </p>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm" aria-live="polite">
          <span className="text-muted-foreground">Novo saldo em aberto</span>
          <span className="text-lg font-semibold tabular-nums text-foreground">{resultado?.ok ? formatarMoeda(resultado.novoSaldo) : '—'}</span>
        </div>
        {erro && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</p>}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={voltar} disabled={salvando}>Cancelar</Button>
          <Button type="submit" disabled={salvando || !alterado || motivoCurto} className="gap-2">
            {salvando && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Salvar renegociação
          </Button>
        </div>
      </form>

      <UnsavedChangesDialog
        open={blocker.state === 'blocked'}
        onOpenChange={aberto => { if (!aberto && blocker.state === 'blocked') blocker.reset(); }}
        onConfirm={() => { if (blocker.state === 'blocked') { navegacaoLiberada.current = true; blocker.proceed(); } }}
      />
    </div>
  );
}
