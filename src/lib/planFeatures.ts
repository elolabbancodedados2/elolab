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

const RECURSOS_DE_TODOS_OS_PLANOS = new Set(['exames', 'automacoes']);

export function canAccessPlanFeature(
  assinatura: PlanFeatureAccess | null | undefined,
  feature: string,
  isPlatformAdmin = false,
): boolean {
  if (isPlatformAdmin) return true;
  // Os dois planos vendidos incluem exames e automações, e o servidor já bloqueia
  // clínica sem pagamento. A assinatura é lida pela linha do dono, então a equipe
  // não teria plano próprio: estes recursos não dependem dela.
  if (RECURSOS_DE_TODOS_OS_PLANOS.has(feature)) return true;
  if (!assinatura || !['ativa', 'trial'].includes(assinatura.status)) return false;
  if (assinatura.plano_slug === 'elolab-ultra') return true;
  if (assinatura.plano_slug === 'elolab-max') return feature !== 'agente_ia';
  return false;
}
