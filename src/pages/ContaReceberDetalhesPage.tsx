import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleDollarSign, Clock3, Eye, History, Receipt, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmBlocos } from '@/lib/buscarEmBlocos';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { valorRecebidoDaConta } from '@/lib/contasReceber';
import { buscarDadosBasicosPacientes } from '@/lib/patientBasicData';
import { CAMPOS_TRILHA, formatarValorTrilha } from '@/lib/trilhaLancamento';
import { Database } from '@/integrations/supabase/types';
import { formatWithDatePreference } from '@/lib/datePreference';

type Account = {
  id: string;
  clinica_id: string;
  tipo: 'receita';
  paciente_id: string | null;
  categoria: string | null;
  descricao: string;
  valor: number;
  valor_pago: number | null;
  desconto: number | null;
  acrescimo: number | null;
  data_vencimento: string | null;
  forma_pagamento: string | null;
  competencia: string | null;
  centro_custo: string | null;
  numero_documento: string | null;
  observacoes: string | null;
  status: string;
  created_at: string;
};

type Payment = {
  id: string;
  valor: number;
  forma_pagamento: string;
  data_pagamento: string;
  observacoes: string | null;
  estornado_em: string | null;
  motivo_estorno: string | null;
};

type Change = Database['public']['Functions']['historico_alteracoes_lancamento']['Returns'][number];
type RouteState = { returnTo?: unknown; restoreSearchTerm?: unknown; restoreFilterCategoria?: unknown };

const CATEGORIES: Record<string, string> = {
  consulta: 'Consulta Médica', retorno: 'Retorno', procedimento: 'Procedimento', exame: 'Exame / Diagnóstico',
  cirurgia: 'Cirurgia / Intervenção', internacao: 'Internação', taxa_administrativa: 'Taxa Administrativa',
  taxa_material: 'Taxa de Material', convenio_repasse: 'Repasse de Convênio', honorario_medico: 'Honorário Médico',
  fisioterapia: 'Fisioterapia', psicologia: 'Psicologia', pediatria: 'Pediatria', outros: 'Outros',
};
const COST_CENTERS: Record<string, string> = {
  geral: 'Geral', ambulatorio: 'Ambulatório', laboratorio: 'Laboratório', centro_cirurgico: 'Centro Cirúrgico',
  estetica: 'Estética', odonto: 'Odontologia', fisioterapia: 'Fisioterapia',
};
const PAYMENT_METHODS: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', credito: 'Cartão de crédito', cartao_credito: 'Cartão de crédito',
  debito: 'Cartão de débito', cartao_debito: 'Cartão de débito', convenio: 'Convênio',
  transferencia: 'Transferência', boleto: 'Boleto', cheque: 'Cheque',
};
const STATUS: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'border-warning/30 bg-warning/10 text-warning-foreground' },
  parcial: { label: 'Parcial', className: 'border-warning/30 bg-warning/10 text-warning-foreground' },
  pago: { label: 'Recebido', className: 'border-success/20 bg-success/10 text-success' },
  atrasado: { label: 'Atrasado', className: 'border-destructive/20 bg-destructive/10 text-destructive' },
  cancelado: { label: 'Cancelado', className: 'border-border bg-muted text-muted-foreground' },
  estornado: { label: 'Estornado', className: 'border-border bg-muted text-muted-foreground' },
};

const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const dateOnly = (value: string | null) => value ? formatWithDatePreference(parseDateOnly(value)!, 'dd/MM/yyyy') : '—';
const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
}).format(new Date(value));

function Definition({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-1 break-words text-sm font-medium text-foreground">{children || '—'}</dd>
  </div>;
}

export default function ContaReceberDetalhesPage() {
  const { lancamentoId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const clinicId = profile?.clinica_id ?? null;
  const routeState = location.state as RouteState | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/contas(?:\?.*)?$/.test(routeState.returnTo)
    ? routeState.returnTo : '/contas?tab=receber';
  const returnState = {
    restoreSearchTerm: typeof routeState?.restoreSearchTerm === 'string' ? routeState.restoreSearchTerm : '',
    restoreFilterCategoria: typeof routeState?.restoreFilterCategoria === 'string' ? routeState.restoreFilterCategoria : 'todas',
  };

  const accountQuery = useQuery({
    queryKey: ['receivable-detail', clinicId, lancamentoId],
    enabled: Boolean(clinicId && lancamentoId),
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos')
        .select('id, clinica_id, tipo, paciente_id, categoria, descricao, valor, valor_pago, desconto, acrescimo, data_vencimento, forma_pagamento, competencia, centro_custo, numero_documento, observacoes, status, created_at')
        .eq('id', lancamentoId).eq('clinica_id', clinicId!).eq('tipo', 'receita').maybeSingle();
      if (error) throw error;
      return data as Account | null;
    },
  });
  const account = accountQuery.data;

  const paymentsQuery = useQuery({
    queryKey: ['receivable-detail-payments', clinicId, lancamentoId],
    enabled: Boolean(clinicId && account),
    queryFn: async () => buscarEmBlocos<Payment>(() => supabase.from('pagamentos')
      .select('id, valor, forma_pagamento, data_pagamento, observacoes, estornado_em, motivo_estorno')
      .eq('clinica_id', clinicId!).eq('lancamento_id', lancamentoId)
      .order('data_pagamento', { ascending: false }).order('id', { ascending: false })),
  });
  const payments = paymentsQuery.data ?? [];
  const activePayments = payments.filter(payment => !payment.estornado_em);
  const received = account ? valorRecebidoDaConta(
    account, !paymentsQuery.isError, payments.length > 0,
    activePayments.reduce((sum, payment) => sum + Number(payment.valor || 0), 0),
  ) : 0;
  const balance = account ? Math.max(0,
    Number(account.valor || 0) - Number(account.desconto || 0) + Number(account.acrescimo || 0) - received,
  ) : 0;

  const patientQuery = useQuery({
    queryKey: ['receivable-detail-patient', account?.paciente_id],
    enabled: Boolean(account?.paciente_id),
    queryFn: async () => (await buscarDadosBasicosPacientes([account!.paciente_id!])).get(account!.paciente_id!) ?? null,
  });
  const historyQuery = useQuery({
    queryKey: ['historico-lancamento', lancamentoId],
    enabled: Boolean(account),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('historico_alteracoes_lancamento', { p_lancamento_id: lancamentoId });
      if (error) throw error;
      return (data ?? []) as Change[];
    },
  });

  const returnToList = () => navigate(returnTo, { state: returnState });
  const navigateToAction = (action: 'recebimento' | 'estorno') => navigate(
    `/contas/receber/${encodeURIComponent(lancamentoId)}/${action}`,
    { state: { returnTo, ...returnState } },
  );

  if (accountQuery.isLoading) return <main data-testid="receivable-detail-page" className="space-y-5" aria-busy="true">
    <Skeleton className="h-10 w-72" /><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-64 rounded-xl" />
  </main>;
  if (accountQuery.isError) return <ErrorState title="Não foi possível carregar a conta a receber" error={accountQuery.error} onRetry={() => void accountQuery.refetch()} />;
  if (!account) return <main data-testid="receivable-detail-page" className="space-y-5">
    <PageHeader title="Conta a receber indisponível" description="Esta conta não existe ou não está disponível nesta clínica."
      actions={<Button variant="outline" onClick={returnToList}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar às contas</Button>} />
  </main>;

  const overdue = ['pendente', 'parcial'].includes(account.status) && Boolean(account.data_vencimento)
    && account.data_vencimento! < todaySaoPauloDateOnly();
  const statusKey = account.status === 'pendente' && overdue ? 'atrasado' : account.status;
  const status = STATUS[statusKey] ?? { label: account.status, className: 'border-border bg-muted text-muted-foreground' };
  const canReceive = ['pendente', 'parcial', 'atrasado'].includes(statusKey) && balance > 0;
  const canReverse = ['pago', 'parcial'].includes(account.status) && activePayments.length > 0;
  const patientName = account.paciente_id
    ? patientQuery.data?.nome_social || patientQuery.data?.nome || 'Paciente vinculado'
    : 'Particular';
  const categoryLabels = { ...CATEGORIES };

  return <main data-testid="receivable-detail-page" className="space-y-6 pb-8">
    <PageHeader
      title="Detalhes da conta a receber"
      description="Consulte valores, recebimentos e alterações desta conta."
      icon={<Eye />}
      actions={<>
        {canReceive && <Button onClick={() => navigateToAction('recebimento')}><Receipt aria-hidden="true" className="mr-2 h-4 w-4" />Receber</Button>}
        {canReverse && <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => navigateToAction('estorno')}><RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />Estornar pagamento</Button>}
        <Button variant="outline" onClick={returnToList}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar às contas</Button>
      </>}
    />

    <section aria-label="Resumo financeiro" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{patientName}</p>
          <h2 className="mt-1 break-words text-lg font-semibold">{account.descricao}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={status.className}>{status.label}</Badge>
            {overdue && <span className="text-xs text-destructive">Vencida</span>}
            <span className="text-xs text-muted-foreground">{CATEGORIES[account.categoria ?? ''] ?? account.categoria ?? 'Sem categoria'}</span>
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-xs text-muted-foreground">Saldo em aberto</p>
          <p className="text-2xl font-bold tabular-nums">{currency(balance)}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-4">
        <Definition label="Valor original">{currency(Number(account.valor))}</Definition>
        <Definition label="Valor recebido">{currency(received)}</Definition>
        <Definition label="Vencimento">{dateOnly(account.data_vencimento)}</Definition>
        <Definition label="Forma de pagamento">{account.forma_pagamento ? PAYMENT_METHODS[account.forma_pagamento] ?? account.forma_pagamento : '—'}</Definition>
        <Definition label="Categoria">{CATEGORIES[account.categoria ?? ''] ?? account.categoria}</Definition>
        <Definition label="Competência">{account.competencia}</Definition>
        <Definition label="Centro de custo">{COST_CENTERS[account.centro_custo ?? ''] ?? account.centro_custo}</Definition>
        <Definition label="Documento">{account.numero_documento}</Definition>
        <Definition label="Criada em">{account.created_at ? dateTime(account.created_at) : '—'}</Definition>
      </dl>
      {(account.observacoes || patientQuery.isError) && <>
        <Separator />
        <div className="space-y-3 p-4 sm:p-5">
          {account.observacoes && <div><p className="text-xs text-muted-foreground">Observações</p><p className="mt-1 whitespace-pre-wrap text-sm">{account.observacoes}</p></div>}
          {patientQuery.isError && <ErrorState compact description="Não foi possível carregar o nome do paciente vinculado." error={patientQuery.error} onRetry={() => void patientQuery.refetch()} />}
        </div>
      </>}
    </section>

    <section aria-labelledby="receivable-payments-title" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
        <CircleDollarSign aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />
        <div><h2 id="receivable-payments-title" className="font-semibold">Movimentações de recebimento</h2><p className="mt-0.5 text-xs text-muted-foreground">Pagamentos registrados e eventuais estornos desta conta.</p></div>
      </div>
      {paymentsQuery.isLoading ? <div className="space-y-3 p-4" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        : paymentsQuery.isError ? <div className="p-4"><ErrorState compact description="Não foi possível carregar os pagamentos desta conta." error={paymentsQuery.error} onRetry={() => void paymentsQuery.refetch()} /></div>
          : payments.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum pagamento foi registrado para esta conta.</p>
            : <ol className="divide-y divide-border">{payments.map(payment => <li key={payment.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div className="flex min-w-0 gap-3">
                <span aria-hidden="true" className="mt-0.5 text-muted-foreground">{payment.estornado_em ? <RotateCcw className="h-4 w-4" /> : <CircleDollarSign className="h-4 w-4" />}</span>
                <div className="min-w-0">
                  <p className="font-medium">{payment.estornado_em ? 'Pagamento estornado' : 'Pagamento recebido'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{dateTime(payment.data_pagamento)} · {PAYMENT_METHODS[payment.forma_pagamento] ?? payment.forma_pagamento}</p>
                  {payment.observacoes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{payment.observacoes}</p>}
                  {payment.estornado_em && <p className="mt-1 text-xs text-muted-foreground">Estornado em {dateTime(payment.estornado_em)}{payment.motivo_estorno ? ` · ${payment.motivo_estorno}` : ''}</p>}
                </div>
              </div>
              <p className="shrink-0 font-semibold tabular-nums sm:text-right">{currency(Number(payment.valor))}</p>
            </li>)}</ol>}
    </section>

    <section aria-labelledby="receivable-changes-title" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
        <History aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />
        <div><h2 id="receivable-changes-title" className="font-semibold">Histórico da conta</h2><p className="mt-0.5 text-xs text-muted-foreground">Alterações registradas em vencimento, valor e classificação, com responsável e horário.</p></div>
      </div>
      {historyQuery.isLoading ? <div className="space-y-3 p-4" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        : historyQuery.isError ? <div className="p-4"><ErrorState compact description="Não foi possível carregar o histórico de alterações desta conta." error={historyQuery.error} onRetry={() => void historyQuery.refetch()} /></div>
          : historyQuery.data?.length ? <ol className="divide-y divide-border">{historyQuery.data.map((change, index) => <li key={`${change.alterado_em}-${change.campo}-${index}`} className="flex flex-col gap-2 p-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{CAMPOS_TRILHA[change.campo] ?? change.campo}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{dateTime(change.alterado_em)} · {change.alterado_por_nome || 'Sistema'}</p>
            </div>
            <p className="break-words text-sm"><span className="text-muted-foreground">{formatarValorTrilha(change.campo, change.valor_anterior, categoryLabels)}</span><span aria-hidden="true" className="px-2 text-muted-foreground">→</span><span className="font-medium">{formatarValorTrilha(change.campo, change.valor_novo, categoryLabels)}</span></p>
          </li>)}</ol>
            : <p className="p-4 text-sm text-muted-foreground">Nenhuma alteração desses campos foi registrada.</p>}
    </section>

  </main>;
}
