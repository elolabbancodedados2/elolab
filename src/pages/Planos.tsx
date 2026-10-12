import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Check, Crown, Sparkles, Clock, Gift, ArrowRight, Shield, Headphones, XCircle } from 'lucide-react';
import { useUserPlan, usePlanos } from '@/hooks/useSubscriptionPlan';
import { useBillingStatus } from '@/hooks/usePlanCheckout';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ErrorState } from '@/components/ErrorState';

const planConfig: Record<string, {
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  borderAccent: string;
  btnClass: string;
}> = {
  'elolab-max': {
    icon: <Crown className="h-7 w-7" />,
    gradient: 'from-info/5 via-transparent to-transparent',
    iconBg: 'bg-primary/10 text-primary',
    borderAccent: 'border-info/20 hover:border-info/50',
    btnClass: '',
  },
  'elolab-ultra': {
    icon: <Sparkles className="h-7 w-7" />,
    gradient: 'from-success/5 via-transparent to-transparent',
    iconBg: 'bg-success/10 text-success',
    borderAccent: 'border-success/25 hover:border-success/55',
    btnClass: 'bg-success text-success-foreground hover:bg-success/90 shadow-sm shadow-success/15 border-0',
  },
};

const featureLabels: Record<string, string> = {
  dashboard: 'Dashboard Analítico',
  agenda: 'Agenda & Agendamentos',
  pacientes: 'Gestão de Pacientes',
  prontuarios: 'Prontuário Eletrônico',
  prescricoes: 'Prescrições Médicas',
  atestados: 'Atestados',
  exames: 'Módulo de Exames',
  triagem: 'Triagem Manchester',
  fila: 'Fila de Atendimento',
  salas: 'Gestão de Salas',
  estoque: 'Controle de Estoque',
  financeiro: 'Módulo Financeiro',
  relatorios: 'Relatórios',
  convenios: 'Gestão de Convênios',
  funcionarios: 'Gestão de Funcionários',
  automacoes: 'Automações',
  analytics: 'Analytics Avançado',
  templates: 'Templates Reutilizáveis',
  encaminhamentos: 'Encaminhamentos',
  lista_espera: 'Lista de Espera',
  painel_tv: 'Painel TV',
  pagamentos: 'Pagamentos Mercado Pago',
  agente_ia: 'Atendente de IA para a clínica',
};

const premiumFeatures = ['agente_ia'];

export default function Planos() {
  const { user, isPlatformAdmin } = useSupabaseAuth();
  const { data: planos, isLoading: loadingPlanos, isError: erroAoCarregarPlanos, error: erroPlanos, refetch: refetchPlanos } = usePlanos(!isPlatformAdmin);
  const { planSlug, hasActivePlan, isTrial, trialEnd, trialDaysLeft, isLoading: loadingAssinatura, isError: erroAoConsultarAssinatura, error: erroAssinatura, refetch: refetchAssinatura } = useUserPlan();
  const {
    data: billing,
    isLoading: loadingBilling,
    isError: erroAoConsultarCobranca,
    refetch: refetchBilling,
  } = useBillingStatus(undefined, !isPlatformAdmin);
  const bloquearAcoesCobranca = loadingBilling || erroAoConsultarCobranca || !billing;
  const navigate = useNavigate();
  const irParaCheckout = (slug: string, params = '') => navigate(`/planos/checkout/${slug}${params}`);
  const prePago = billing?.assinatura?.modalidade === 'pre_pago' ? billing.assinatura : null;
  const prePagoFim = prePago?.data_fim ? new Date(prePago.data_fim) : null;
  const diasParaVencer = prePagoFim ? Math.ceil((prePagoFim.getTime() - Date.now()) / 86400000) : null;
  const queryClient = useQueryClient();

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const cancelMutation = useMutation({
    mutationFn: async (motivo: string) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase.functions.invoke('mercadopago-checkout', {
        body: {
          action: 'cancel_subscription',
          motivo: motivo.trim().slice(0, 500) || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Assinatura cancelada. O acesso continua até o fim do período pago.');
      setShowCancelDialog(false);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['user_plan'] });
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao cancelar assinatura'),
  });

  if (isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl py-16">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
          <Shield className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold">Acesso da plataforma</h1>
          <p className="mt-3 text-muted-foreground">
            Esta conta administra o EloLab e também pode acessar o app. Ela é isenta dos planos de cliente e não gera cobranças de assinatura.
          </p>
        </div>
      </div>
    );
  }

  if (loadingPlanos || loadingAssinatura) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando planos...</p>
        </div>
      </div>
    );
  }

  if (erroAoConsultarAssinatura) {
    return <ErrorState title="Não foi possível confirmar sua assinatura" description="Por segurança, aguarde a consulta funcionar antes de iniciar outra contratação." error={erroAssinatura} onRetry={() => { void refetchAssinatura(); }} />;
  }

  if (erroAoCarregarPlanos) {
    return <ErrorState title="Não foi possível carregar os planos" error={erroPlanos} onRetry={() => { void refetchPlanos(); }} />;
  }

  if (!planos?.length) {
    return <div className="mx-auto max-w-xl rounded-xl border border-dashed p-8 text-center"><h2 className="font-semibold">Nenhum plano disponível no momento</h2><p className="mt-2 text-sm text-muted-foreground">Tente atualizar a lista em instantes.</p><Button className="mt-4" variant="outline" onClick={() => void refetchPlanos()}>Atualizar planos</Button></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      {/* Header */}
      <div className="space-y-5 border-b border-primary/10 pb-6 pt-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Planos e preços</h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            Compare os recursos para escolher o plano certo para sua clínica.
          </p>
        </div>
        {!hasActivePlan && planos.some((plano) => Number(plano.trial_dias) > 0) && (
          <div className="inline-flex items-center gap-2 rounded-xl border border-info/20 bg-info/5 px-4 py-2.5 text-sm font-medium text-info">
            <Gift className="h-4 w-4" />
            Período de teste disponível nos planos elegíveis
          </div>
        )}
      </div>

      {loadingBilling && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-info/20 bg-info/5 px-4 py-3 text-sm text-info">
          <Clock className="h-4 w-4" /> Confirmando a forma de cobrança da sua assinatura…
        </div>
      )}
      {erroAoConsultarCobranca && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>Não foi possível confirmar a situação da cobrança. Atualize antes de gerenciar sua assinatura.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetchBilling()} className="shrink-0">
            Atualizar cobrança
          </Button>
        </div>
      )}

      {/* Trial Banner */}
      {isTrial && trialEnd && (
        <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Período de teste ativo</p>
              <p className="text-sm text-muted-foreground">
                {trialDaysLeft > 0
                  ? `Restam ${trialDaysLeft} dia${trialDaysLeft !== 1 ? 's' : ''} — expira em ${format(trialEnd, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
                  : 'Seu período de teste expirou'}
              </p>
            </div>
          </div>
          <Button
            disabled={bloquearAcoesCobranca}
            onClick={() => { if (planSlug) irParaCheckout(planSlug); }}
            className="gap-2 shrink-0"
          >
            Assinar Agora
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Período pré-pago (Pix/boleto) */}
      {prePago && prePagoFim && (
        <div className={`rounded-xl border p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${diasParaVencer !== null && diasParaVencer <= 7 ? 'border-warning/40 bg-warning/5' : 'border-primary/20 bg-gradient-to-r from-primary/5 to-transparent'}`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {prePago.status === 'ativa' ? 'Plano pago por período' : 'Período pago encerrado'}
              </p>
              <p className="text-sm text-muted-foreground">
                {prePago.status === 'ativa'
                  ? `Acesso liberado até ${format(prePagoFim, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}. Não renova automaticamente.`
                  : 'Pague um novo período ou assine no cartão para voltar a usar todos os recursos.'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" disabled={bloquearAcoesCobranca} onClick={() => irParaCheckout(prePago.plano_slug, '?metodo=pix')}>Pagar próximo período</Button>
            <Button disabled={bloquearAcoesCobranca} onClick={() => irParaCheckout(prePago.plano_slug)} className="gap-2">Assinar no cartão <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Plan Cards */}
      <div className="grid gap-8 md:grid-cols-2">
        {planos?.map((plano) => {
          const isCurrentPlan = hasActivePlan && planSlug === plano.slug;
          const currentPlan = planos.find((item) => item.slug === planSlug);
          const isUpgrade = hasActivePlan && plano.ordem > (currentPlan?.ordem ?? 0);
          const isHighlighted = plano.destaque;
          const config = planConfig[plano.slug] || planConfig['elolab-max'];
          const features = plano.features as string[];
          const trialDias = Number(plano.trial_dias) || 0;
          const podeOferecerTrial = trialDias > 0;

          return (
            <div
              key={plano.id}
              className={`
                relative flex flex-col rounded-2xl border bg-card overflow-hidden transition-colors duration-200
                ${config.borderAccent}
                ${isHighlighted ? 'shadow-md ring-1 ring-success/10' : 'shadow-sm hover:shadow-md'}
              `}
            >
              {/* Gradient overlay */}
              <div className={`absolute inset-0 bg-gradient-to-b ${config.gradient} pointer-events-none`} />

              {/* Popular badge */}
              {isHighlighted && (
                <div className="absolute top-0 right-0">
                  <div className="bg-success text-success-foreground text-xs font-semibold px-4 py-1.5 rounded-bl-xl">
                    Mais popular
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="relative p-8 pb-4">
                <div className={`inline-flex p-3 rounded-xl ${config.iconBg} mb-4`}>
                  {config.icon}
                </div>
                <h2 className="text-2xl font-bold text-foreground">{plano.nome}</h2>
                <p className="text-sm text-muted-foreground mt-1">{plano.descricao}</p>
              </div>

              {/* Price */}
              <div className="relative px-8 pb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold tracking-tight text-foreground">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plano.valor)}
                  </span>
                  <span className="text-muted-foreground font-medium">
                    /{plano.frequencia === 'mensal' ? 'mês' : plano.frequencia}
                  </span>
                </div>
                {!hasActivePlan && podeOferecerTrial && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Gift className="h-3.5 w-3.5 text-info" />
                    {trialDias} dias grátis no cartão; depois, {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plano.valor)} por período
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className="mx-8 border-t border-border/60" />

              {/* Features */}
              <div className="relative flex-1 p-8 pt-6">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  O que está incluído
                </p>
                <ul className="space-y-3">
                  {features.map((feature) => {
                    const isPremium = premiumFeatures.includes(feature);
                    return (
                      <li key={feature} className="flex items-start gap-3 text-sm">
                        <div className={`mt-0.5 shrink-0 rounded-full p-0.5 ${isPremium ? 'bg-success/10 text-success' : 'bg-info/10 text-info'}`}>
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </div>
                        <span className="text-foreground/90">
                          {featureLabels[feature] || feature}
                          {isPremium && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 border-success/25 text-success">
                              Exclusivo
                            </Badge>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Footer */}
              <div className="relative p-8 pt-2 flex flex-col gap-3">
                {isCurrentPlan ? (
                  <>
                    <Button className="w-full h-12 text-base" variant="outline" disabled>
                      <Shield className="h-4 w-4 mr-2" />
                      {isTrial ? 'Em Período de Teste' : 'Seu Plano Atual'}
                    </Button>
                    {prePago && (
                      <p className="text-center text-xs text-muted-foreground">Sem renovação automática — nada a cancelar.</p>
                    )}
                    {!isTrial && !prePago && billing?.assinatura?.plano_slug === plano.slug && billing.assinatura.modalidade === 'recorrente' && !loadingBilling && !erroAoConsultarCobranca && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-muted-foreground hover:text-destructive"
                        onClick={() => setShowCancelDialog(true)}
                        disabled={cancelMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar assinatura'}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    {!hasActivePlan && podeOferecerTrial && (
                      <Button
                        disabled={bloquearAcoesCobranca}
                        className={`w-full h-12 text-base font-semibold ${isHighlighted ? config.btnClass : ''}`}
                        variant={isHighlighted ? 'default' : 'outline'}
                        onClick={() => irParaCheckout(plano.slug, '?trial=1')}
                      >
                        <Gift className="h-4 w-4 mr-2" />
                        {`Testar grátis ${trialDias} dias`}
                      </Button>
                    )}
                    <Button
                      disabled={bloquearAcoesCobranca}
                      className="w-full h-12 text-base"
                      variant={hasActivePlan && isHighlighted ? 'default' : 'ghost'}
                      onClick={() => irParaCheckout(plano.slug)}
                    >
                      {hasActivePlan ? (isUpgrade ? 'Fazer upgrade' : 'Mudar para este plano') : 'Assinar agora'}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust bar */}
      <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-success" />
          <span>Dados criptografados</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span>Cancele quando quiser</span>
        </div>
        <div className="flex items-center gap-2">
          <Headphones className="h-4 w-4 text-primary" />
          <span>Suporte prioritário</span>
        </div>
      </div>

      {/* Cancel Subscription Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Cancelar assinatura?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Sua assinatura será cancelada no Mercado Pago. Você continua com acesso até
                  o fim do período já pago — depois disso, o app fica restrito.
                </p>
                <p>
                  Para voltar a usar, basta assinar novamente nesta página.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="cancel-reason" className="text-sm">
              Motivo do cancelamento (opcional, ajuda a melhorar)
            </Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={500}
              placeholder="Ex.: encontrei outra solução, custo, não atendeu necessidade..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{cancelReason.length}/500</p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              Manter assinatura
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMutation.mutate(cancelReason)}
              disabled={cancelMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
