import { formatWithDatePreference as format } from '@/lib/datePreference';
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
import { Check, Crown, Sparkles, Clock, Gift, ArrowRight, Shield, CreditCard, XCircle } from 'lucide-react';
import { useUserPlan, usePlanos } from '@/hooks/useSubscriptionPlan';
import { useBillingStatus } from '@/hooks/usePlanCheckout';
import { CancelamentoPlanoResumo } from '@/components/CancelamentoPlanoResumo';
import { AvisoAlteracaoPlano } from '@/components/AvisoAlteracaoPlano';

function rotuloFrequencia(frequencia: string) {
  switch (frequencia) {
    case 'mensal': return 'mês';
    case 'trimestral': return '3 meses';
    case 'semestral': return '6 meses';
    case 'anual': return '12 meses';
    default: return 'período';
  }
}
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { descricaoComercialPlano } from '@/lib/planFeatures';
import { cn } from '@/lib/utils';

import { ptBR } from 'date-fns/locale';
import { ErrorState } from '@/components/ErrorState';
import { PageSkeleton } from '@/components/ui/loading-skeleton';

const planConfig: Record<string, {
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  borderAccent: string;
  btnClass: string;
}> = {
  'elolab-max': {
    icon: <Crown className="h-7 w-7" />,
    gradient: 'from-primary/5 via-transparent to-transparent',
    iconBg: 'bg-primary/10 text-primary',
    borderAccent: 'border-[#DCE6F2] hover:border-[#9CC7EC]',
    btnClass: '',
  },
  'elolab-ultra': {
    icon: <Sparkles className="h-7 w-7" />,
    gradient: 'from-primary/10 via-transparent to-transparent',
    iconBg: 'bg-gradient-primary text-white',
    borderAccent: 'border-border hover:border-primary/60',
    btnClass: 'bg-gradient-primary text-white hover:brightness-110 shadow-[0_4px_12px_rgba(16,128,202,0.35)] border-0 rounded-full',
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
  const pedidoAberto = billing?.pedido_aberto && ['criando', 'aguardando_pagamento', 'em_processamento'].includes(billing.pedido_aberto.status)
    ? billing.pedido_aberto
    : null;
  const prePago = billing?.assinatura?.modalidade === 'pre_pago' ? billing.assinatura : null;
  const planoDoTeste = planos?.find((plano) => plano.slug === planSlug);
  const temTesteElegivel = billing?.trial_elegivel === true && !!planos?.some(
    (plano) => Number(plano.trial_dias) > 0,
  );
  const elegibilidadeTesteConhecida = !loadingBilling && !erroAoConsultarCobranca && !!billing;
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
      toast.success('Plano cancelado. O acesso foi encerrado e nenhuma cobrança futura será feita.');
      setShowCancelDialog(false);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['user_plan'] });
      queryClient.invalidateQueries({ queryKey: ['billing_status'] });
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao cancelar assinatura'),
  });

  if (isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl py-16">
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center shadow-xs">
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
    return <div role="status" aria-label="Carregando planos"><PageSkeleton /></div>;
  }

  if (erroAoConsultarAssinatura) {
    return <ErrorState title="Não foi possível confirmar sua assinatura" description="Por segurança, aguarde a consulta funcionar antes de iniciar outra contratação." error={erroAssinatura} onRetry={() => { void refetchAssinatura(); }} />;
  }

  if (erroAoCarregarPlanos) {
    return <ErrorState title="Não foi possível carregar os planos" error={erroPlanos} onRetry={() => { void refetchPlanos(); }} />;
  }

  if (!planos?.length) {
    return <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-border/60 p-8 text-center"><h2 className="font-semibold">Nenhum plano disponível no momento</h2><p className="mt-2 text-sm text-muted-foreground">Tente atualizar a lista em instantes.</p><Button className="mt-4 rounded-full" variant="outline" onClick={() => void refetchPlanos()}>Atualizar planos</Button></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      {/* Header */}
      <div className="space-y-5 border-b border-border/60 pb-6 pt-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Planos e preços</h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            Compare os recursos para escolher o plano certo para sua clínica.
          </p>
        </div>
        {!hasActivePlan && elegibilidadeTesteConhecida && planos.some((plano) => Number(plano.trial_dias) > 0) && (
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-[#F3F8FC] px-4 py-2.5 text-sm font-medium text-primary">
            <Gift className="h-4 w-4" />
            {temTesteElegivel
              ? 'Há um teste grátis disponível para esta conta'
              : 'O teste grátis não está disponível nesta conta'}
          </div>
        )}
      </div>

      {hasActivePlan && <AvisoAlteracaoPlano />}

      {loadingBilling && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-border bg-[#F3F8FC] px-4 py-3 text-sm text-primary">
          <Clock className="h-4 w-4" /> Confirmando a forma de cobrança da sua assinatura…
        </div>
      )}
      {erroAoConsultarCobranca && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>Não foi possível confirmar a situação da cobrança. Atualize antes de gerenciar sua assinatura.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetchBilling()} className="shrink-0 rounded-full">
            Atualizar cobrança
          </Button>
        </div>
      )}
      {pedidoAberto && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-border bg-[#F3F8FC] p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>Há um pagamento pendente para {planos?.find((plano) => plano.slug === pedidoAberto.plano_slug)?.nome ?? 'um plano'}. Conclua ou cancele esse pedido antes de escolher outro plano.</span>
          <Button type="button" size="sm" className="shrink-0 rounded-full bg-gradient-primary text-white hover:brightness-110" onClick={() => irParaCheckout(pedidoAberto.plano_slug)}>
            Continuar pagamento
          </Button>
        </div>
      )}

      {/* Trial Banner */}
      {isTrial && trialEnd && (
        <div className="rounded-2xl border border-primary/30 shadow-[0_8px_24px_rgba(16,128,202,0.12)] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-white">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Período de teste ativo</p>
              <p className="text-sm text-muted-foreground">
                {trialDaysLeft > 0
                  ? `Próxima cobrança${planoDoTeste ? ` de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(planoDoTeste.valor)}/${rotuloFrequencia(planoDoTeste.frequencia)}` : ''} em ${format(trialEnd, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}. Cancele antes disso; o acesso termina ao cancelar.`
                  : 'Seu período de teste expirou'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/configuracoes?tab=plano')}
            className="gap-2 shrink-0 rounded-full bg-gradient-primary text-white hover:brightness-110"
          >
            Gerenciar teste
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Período pré-pago (Pix) */}
      {prePago && prePagoFim && (
        <div className={`rounded-2xl border p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${diasParaVencer !== null && diasParaVencer <= 7 ? 'border-warning/40 bg-warning/5' : 'border-primary/30 shadow-[0_8px_24px_rgba(16,128,202,0.12)]'}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-white">
              <Clock className="h-5 w-5" />
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
            <Button variant="outline" className="rounded-full" disabled={bloquearAcoesCobranca} onClick={() => irParaCheckout(prePago.plano_slug, '?metodo=pix')}>Pagar próximo período</Button>
            <Button disabled={bloquearAcoesCobranca} onClick={() => irParaCheckout(prePago.plano_slug)} className="gap-2 rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110">Assinar no cartão <ArrowRight className="h-4 w-4" /></Button>
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
          const podeOferecerTrial = trialDias > 0 && billing?.trial_elegivel === true;
          const pedidoDeOutroPlanoAberto = !!pedidoAberto && pedidoAberto.plano_slug !== plano.slug;

          return (
            <div
              key={plano.id}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-2xl border transition-colors duration-200',
                isCurrentPlan
                  ? 'border-transparent bg-gradient-primary text-white shadow-lg'
                  : cn('bg-card', config.borderAccent, isHighlighted ? 'shadow-md' : 'shadow-sm hover:shadow-md'),
              )}
            >
              {/* Gradient overlay */}
              {!isCurrentPlan && <div className={`absolute inset-0 bg-gradient-to-b ${config.gradient} pointer-events-none`} />}

              {/* Popular badge */}
              {isHighlighted && (
                <div className="absolute top-0 right-0">
                  <div className={cn('text-xs font-semibold px-4 py-1.5 rounded-bl-2xl', isCurrentPlan ? 'bg-white/15 text-white' : 'bg-gradient-primary text-white')}>
                    Mais popular
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="relative p-8 pb-4">
                <div className={cn('inline-flex p-3 rounded-xl mb-4', isCurrentPlan ? 'bg-white/20 text-white' : config.iconBg)}>
                  {config.icon}
                </div>
                <h2 className={cn('text-2xl font-bold', isCurrentPlan ? 'text-white' : 'text-foreground')}>{plano.nome}</h2>
                <p className={cn('text-sm mt-1', isCurrentPlan ? 'text-white/70' : 'text-muted-foreground')}>{descricaoComercialPlano(plano.slug, plano.descricao)}</p>
              </div>

              {/* Price */}
              <div className="relative px-8 pb-6">
                <div className="flex items-baseline gap-1">
                  <span className={cn('text-5xl font-extrabold tracking-tight', isCurrentPlan ? 'text-white' : 'text-foreground')}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plano.valor)}
                  </span>
                  <span className={cn('font-medium', isCurrentPlan ? 'text-white/70' : 'text-muted-foreground')}>
                    /{rotuloFrequencia(plano.frequencia)}
                  </span>
                </div>
                {!hasActivePlan && podeOferecerTrial && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Gift className="h-3.5 w-3.5 text-primary" />
                    {trialDias} dias grátis no cartão; depois, {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plano.valor)} por {rotuloFrequencia(plano.frequencia)}
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className={cn('mx-8 border-t', isCurrentPlan ? 'border-white/10' : 'border-border/60')} />

              {/* Features */}
              <div className="relative flex-1 p-8 pt-6">
                <p className={cn('text-xs font-semibold uppercase tracking-wider mb-4', isCurrentPlan ? 'text-white/60' : 'text-muted-foreground')}>
                  O que está incluído
                </p>
                <ul className="space-y-3">
                  {features.map((feature) => {
                    const isPremium = premiumFeatures.includes(feature);
                    return (
                      <li key={feature} className="flex items-start gap-3 text-sm">
                        <div className={cn(
                          'mt-0.5 shrink-0 rounded-full p-0.5',
                          isCurrentPlan ? 'bg-white/20 text-white' : isPremium ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary',
                        )}>
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </div>
                        <span className={isCurrentPlan ? 'text-white/90' : 'text-foreground/90'}>
                          {featureLabels[feature] || feature}
                          {isPremium && (
                            <Badge variant="outline" className={cn('ml-2 rounded-full text-[10px] px-1.5 py-0', isCurrentPlan ? 'border-white/25 text-white' : 'border-success/25 text-success')}>
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
                    <Button className="w-full h-12 rounded-full text-base border-white/20 bg-white/5 text-white hover:bg-white/10" variant="outline" disabled>
                      <Shield className="h-4 w-4 mr-2" />
                      {isTrial ? 'Em Período de Teste' : 'Seu Plano Atual'}
                    </Button>
                    {prePago && (
                      <p className="text-center text-xs text-white/60">Sem renovação automática — nada a cancelar.</p>
                    )}
                    {(isTrial || !prePago) && billing?.assinatura?.plano_slug === plano.slug && billing.assinatura.modalidade === 'recorrente' && !loadingBilling && !erroAoConsultarCobranca && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full rounded-full text-white/70 hover:bg-white/10 hover:text-destructive"
                        onClick={() => setShowCancelDialog(true)}
                        disabled={cancelMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        {cancelMutation.isPending ? 'Cancelando...' : isTrial ? 'Cancelar teste grátis' : 'Cancelar assinatura'}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    {!hasActivePlan && podeOferecerTrial && (
                      <Button
                        disabled={bloquearAcoesCobranca || pedidoDeOutroPlanoAberto}
                        className={cn('w-full h-12 rounded-full text-base font-semibold', isHighlighted ? config.btnClass : 'border-border/60')}
                        variant={isHighlighted ? 'default' : 'outline'}
                        onClick={() => irParaCheckout(plano.slug, '?trial=1')}
                      >
                        <Gift className="h-4 w-4 mr-2" />
                        {`Testar grátis ${trialDias} dias`}
                      </Button>
                    )}
                    <Button
                      disabled={bloquearAcoesCobranca || pedidoDeOutroPlanoAberto}
                      className={cn('w-full h-12 rounded-full text-base', hasActivePlan && isHighlighted ? 'bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110' : hasActivePlan ? '' : 'bg-gradient-primary text-white hover:brightness-110')}
                      variant={hasActivePlan && isHighlighted ? 'default' : hasActivePlan ? 'ghost' : 'default'}
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
        <a href="/politica-privacidade" className="flex items-center gap-2 underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Shield className="h-4 w-4 text-primary" />
          <span>Política de privacidade</span>
        </a>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span>Cancelamento online pelo app</span>
        </div>
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <span>Pagamento processado pelo Mercado Pago</span>
        </div>
      </div>

      {/* Cancel Subscription Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              {isTrial ? 'Cancelar teste grátis?' : 'Cancelar assinatura?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div><CancelamentoPlanoResumo isTrial={isTrial} trialEnd={trialEnd} /></div>
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
            <AlertDialogCancel className="rounded-full" disabled={cancelMutation.isPending}>
              Manter assinatura
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMutation.mutate(cancelReason)}
              disabled={cancelMutation.isPending}
              className="rounded-full bg-destructive hover:bg-destructive/90"
            >
              {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
