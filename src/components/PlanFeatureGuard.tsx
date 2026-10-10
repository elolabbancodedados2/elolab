import { Loader2 } from 'lucide-react';
import { ErrorState } from '@/components/ErrorState';
import { FeatureGate } from '@/components/FeatureGate';
import { useUserPlan } from '@/hooks/useSubscriptionPlan';

interface PlanFeatureGuardProps {
  feature: string;
  requiredPlan: string;
  children: React.ReactNode;
}

export function PlanFeatureGuard({ feature, requiredPlan, children }: PlanFeatureGuardProps) {
  const plan = useUserPlan();

  if (plan.isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Verificando plano">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
    </div>;
  }

  if (plan.isError) {
    return <ErrorState title="Não foi possível verificar seu plano" error={plan.error} onRetry={() => plan.refetch()} />;
  }

  return <FeatureGate feature={feature} hasAccess={plan.hasFeature(feature)} requiredPlan={requiredPlan}>{children}</FeatureGate>;
}
