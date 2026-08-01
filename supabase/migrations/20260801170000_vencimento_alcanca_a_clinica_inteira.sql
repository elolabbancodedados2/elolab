-- O vencimento só barrava o dono da clínica. A equipe continuava trabalhando.
--
-- A verificação olhava a assinatura DE QUEM ESTAVA LOGADO. Como só o dono tem
-- assinatura, todo funcionário caía no caminho "sem assinatura registrada →
-- libera". Na prática, uma clínica vencida perdia o acesso do administrador e
-- seguia atendendo normalmente por médico, recepção e enfermagem — o
-- vencimento não cobrava ninguém.
--
-- Passa a olhar a assinatura do DONO DA CLÍNICA de quem está logado. Quem
-- pertence à clínica compartilha a situação dela, que é o que a assinatura
-- sempre significou: o contrato é da clínica, não da pessoa.
--
-- Efeito medido antes de aplicar, sobre as contas reais: ninguém passa a ser
-- bloqueado neste instante. Monte Sinai (dono + 4) e INOVALAB (dono + 1)
-- seguem liberados até 31/08 e então bloqueiam juntos. As três clínicas
-- canceladas hoje são de uma pessoa só, então nada muda para elas.

create or replace function public.clinica_acesso_bloqueado()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  GRACE_DAYS constant integer := 7;
  v_uid        uuid;
  v_assinatura record;
  v_fim        timestamptz;
BEGIN
  v_uid := auth.uid();

  -- service_role, cron, webhooks: nunca bloqueia
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Dono da plataforma nunca é bloqueado
  IF public.is_platform_admin() THEN
    RETURN false;
  END IF;

  -- A assinatura de referência é a do dono da clínica.
  --
  -- COALESCE(c.owner_id, p.id): sem clínica, ou clínica sem dono (o owner_id
  -- vira NULL quando a conta do dono é apagada), cai de volta na assinatura da
  -- própria pessoa. Uma clínica órfã não pode trancar quem trabalha nela por
  -- causa de um buraco no cadastro.
  SELECT a.status, a.data_fim, a.trial_fim
    INTO v_assinatura
    FROM public.profiles p
    LEFT JOIN public.clinicas c ON c.id = p.clinica_id
    LEFT JOIN LATERAL (
      SELECT ap.status, ap.data_fim, ap.trial_fim
        FROM public.assinaturas_plano ap
       WHERE ap.user_id = COALESCE(c.owner_id, p.id)
       ORDER BY ap.created_at DESC
       LIMIT 1
    ) a ON true
   WHERE p.id = v_uid;

  -- Sem perfil, ou sem assinatura de referência → libera (clientes antigos,
  -- contas internas). O LEFT JOIN devolve linha com status NULL quando não há
  -- assinatura, então NOT FOUND sozinho não basta.
  IF NOT FOUND OR v_assinatura.status IS NULL THEN
    RETURN false;
  END IF;

  -- Só bloqueia status explicitamente encerrado
  IF v_assinatura.status NOT IN ('expirada', 'cancelada') THEN
    RETURN false;
  END IF;

  v_fim := COALESCE(v_assinatura.data_fim, v_assinatura.trial_fim);

  -- Sem data de término confiável → libera
  IF v_fim IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_fim < (now() - (GRACE_DAYS || ' days')::interval);
EXCEPTION WHEN others THEN
  -- Qualquer erro inesperado libera o acesso em vez de travar a clínica
  RETURN false;
END;
$function$;

comment on function public.clinica_acesso_bloqueado() is
  'Vencimento da clínica. Olha a assinatura do DONO da clínica de quem está logado, para alcançar a equipe inteira e não só o administrador. Falha sempre para o lado de liberar.';
