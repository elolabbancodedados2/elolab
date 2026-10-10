// Sincroniza assinaturas_plano com o estado de uma assinatura recorrente
// (/preapproval). Extraído de mercadopago-webhook para ser reutilizado pelo
// checkout transparente no cartão. Além da regra original, marca a modalidade
// "recorrente" e não derruba um período pré-pago (Pix/boleto) vigente.

const MP_API_BASE = "https://api.mercadopago.com";

export type PlatformPlanSyncInput = {
  assinaturaId: string;
  userId: string;
  planoId: string;
  planoSlug: string;
  gatewayStatus: string;
  trialEnd?: string | null;
};

export async function syncPlatformPlan(supabase: any, input: PlatformPlanSyncInput, mpToken?: string) {
  const now = new Date();
  const trialIsActive = Boolean(
    input.trialEnd && new Date(input.trialEnd).getTime() > now.getTime()
  );
  const targetStatus = input.gatewayStatus === "authorized"
    ? (trialIsActive ? "trial" : "ativa")
    : input.gatewayStatus === "cancelled" || input.gatewayStatus === "canceled"
      ? "cancelada"
      : input.gatewayStatus === "paused"
        ? "pausada"
        : "pendente";

  const { data: existingPlan, error: existingError } = await supabase
    .from("assinaturas_plano")
    .select("id, status, mp_assinatura_id, cobranca_modalidade")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (existingError) throw existingError;

  // Do not take an already active plan offline while a replacement checkout
  // is still pending. The replacement becomes authoritative once authorized.
  if (
    existingPlan &&
    targetStatus === "pendente" &&
    ["ativa", "trial"].includes(existingPlan.status)
  ) {
    return;
  }

  // Um período pré-pago (Pix/boleto) vigente não é derrubado por uma
  // assinatura no cartão que não chegou a ser autorizada.
  if (
    existingPlan &&
    existingPlan.cobranca_modalidade === "pre_pago" &&
    !["ativa", "trial"].includes(targetStatus)
  ) {
    return;
  }

  if (
    existingPlan &&
    ["cancelada", "pausada"].includes(targetStatus) &&
    existingPlan.mp_assinatura_id &&
    existingPlan.mp_assinatura_id !== input.assinaturaId
  ) {
    return;
  }

  const baseData = {
    plano_id: input.planoId,
    plano_slug: input.planoSlug,
    status: targetStatus,
    mp_assinatura_id: input.assinaturaId,
    em_trial: targetStatus === "trial",
    trial_fim: targetStatus === "trial" ? input.trialEnd : null,
    data_cancelamento: targetStatus === "cancelada" ? now.toISOString() : null,
    cobranca_modalidade: "recorrente",
    ...(["ativa", "trial"].includes(targetStatus) ? { data_fim: null } : {}),
    updated_at: now.toISOString(),
  };

  if (existingPlan?.id) {
    if (
      ["ativa", "trial"].includes(targetStatus) &&
      existingPlan.mp_assinatura_id &&
      existingPlan.mp_assinatura_id !== input.assinaturaId &&
      mpToken
    ) {
      const { data: previousGateway, error: previousGatewayError } = await supabase
        .from("assinaturas_mercadopago")
        .select("id, mp_preapproval_id, status")
        .eq("id", existingPlan.mp_assinatura_id)
        .maybeSingle();
      if (previousGatewayError) throw previousGatewayError;

      if (previousGateway?.mp_preapproval_id && previousGateway.status !== "cancelada") {
        const cancelResponse = await fetch(
          `${MP_API_BASE}/preapproval/${previousGateway.mp_preapproval_id}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${mpToken}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ status: "cancelled" }),
          },
        );
        if (!cancelResponse.ok) {
          throw new Error(`Não foi possível cancelar a assinatura anterior (${cancelResponse.status})`);
        }

        const { error: previousUpdateError } = await supabase
          .from("assinaturas_mercadopago")
          .update({ status: "cancelada", data_fim: now.toISOString().slice(0, 10) })
          .eq("id", previousGateway.id);
        if (previousUpdateError) throw previousUpdateError;
      }
    }

    const { error } = await supabase
      .from("assinaturas_plano")
      .update(baseData)
      .eq("id", existingPlan.id);
    if (error) throw error;
    if (["ativa", "trial"].includes(targetStatus)) {
      const { error: provisionError } = await supabase.rpc("provision_clinic_after_subscription", { p_user_id: input.userId });
      if (provisionError) throw new Error(`Assinatura autorizada, mas a clínica não foi provisionada: ${provisionError.message}`);
    }
    return;
  }

  if (["ativa", "trial", "pendente"].includes(targetStatus)) {
    const { error } = await supabase
      .from("assinaturas_plano")
      .insert({
        user_id: input.userId,
        data_inicio: now.toISOString(),
        ...baseData,
      });
    if (error) throw error;
    if (["ativa", "trial"].includes(targetStatus)) {
      const { error: provisionError } = await supabase.rpc("provision_clinic_after_subscription", { p_user_id: input.userId });
      if (provisionError) throw new Error(`Assinatura autorizada, mas a clínica não foi provisionada: ${provisionError.message}`);
    }
  }
}
