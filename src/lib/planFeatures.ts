export interface PlanFeatureAccess {
  plano_slug: string;
  status: string;
}

export function descricaoComercialPlano(slug: string, descricao: string | null | undefined): string {
  if (slug === 'elolab-max') {
    return 'Gestão completa da rotina da clínica. O Agente de IA está disponível no EloLab Ultra.';
  }
  return descricao ?? '';
}

export function canAccessPlanFeature(
  assinatura: PlanFeatureAccess | null | undefined,
  feature: string,
  isPlatformAdmin = false,
): boolean {
  if (isPlatformAdmin) return true;
  if (!assinatura || !['ativa', 'trial'].includes(assinatura.status)) return false;
  if (assinatura.plano_slug === 'elolab-ultra') return true;
  if (assinatura.plano_slug === 'elolab-max') return feature !== 'agente_ia';
  return false;
}
