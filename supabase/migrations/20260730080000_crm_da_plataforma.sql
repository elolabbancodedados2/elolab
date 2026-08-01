-- ============================================================================
-- CRM da plataforma: uma visão de cliente, não de banco de dados
--
-- Já existia platform_get_clinicas_overview, que devolve contagens. Serve para
-- saber o tamanho de cada clínica, não para tocar o negócio: falta quanto cada
-- uma paga, quando vence, quem é o contato e se a clínica está viva ou parada.
--
-- Esta função responde as perguntas de quem opera o SaaS:
--   quem vence esta semana
--   quanto entra por mês
--   quem parou de usar (sinal de cancelamento antes de acontecer)
--   com quem falar, e por qual telefone
--
-- SÓ O DONO DA PLATAFORMA. A checagem é a primeira linha e levanta exceção em
-- vez de devolver vazio: silêncio parece "não há clientes" e esconde o defeito.
--
-- ATIVIDADE é o máximo entre a última consulta agendada, o último prontuário e
-- o último paciente cadastrado. Uma clínica sem nada disso há semanas está
-- saindo, mesmo que a assinatura ainda esteja paga.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_crm_overview()
RETURNS TABLE (
  clinica_id        uuid,
  clinica_nome      text,
  cnpj              text,
  suspensa          boolean,
  cliente_desde     timestamptz,
  dono_nome         text,
  dono_email        text,
  dono_telefone     text,
  plano_nome        text,
  plano_valor       numeric,
  assinatura_status text,
  em_trial          boolean,
  vence_em          timestamptz,
  dias_para_vencer  integer,
  total_medicos     bigint,
  total_funcionarios bigint,
  total_pacientes   bigint,
  total_agendamentos bigint,
  ultima_atividade  timestamptz,
  dias_sem_uso      integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas o dono da plataforma pode consultar o CRM.';
  END IF;

  RETURN QUERY
  WITH atividade AS (
    SELECT c.id AS cid,
           GREATEST(
             COALESCE((SELECT max(a.created_at) FROM public.agendamentos a WHERE a.clinica_id = c.id), 'epoch'::timestamptz),
             COALESCE((SELECT max(pr.created_at) FROM public.prontuarios pr WHERE pr.clinica_id = c.id), 'epoch'::timestamptz),
             COALESCE((SELECT max(pa.created_at) FROM public.pacientes pa WHERE pa.clinica_id = c.id), 'epoch'::timestamptz)
           ) AS ultima
      FROM public.clinicas c
  )
  SELECT
    c.id,
    c.nome,
    c.cnpj,
    COALESCE(c.suspensa, false),
    c.created_at,
    p.nome,
    p.email,
    p.telefone,
    pl.nome,
    pl.valor,
    ap.status,
    COALESCE(ap.em_trial, false),
    COALESCE(ap.data_fim, ap.trial_fim),
    -- Negativo = já venceu. Nulo quando não há assinatura registrada.
    CASE WHEN COALESCE(ap.data_fim, ap.trial_fim) IS NULL THEN NULL
         ELSE EXTRACT(day FROM COALESCE(ap.data_fim, ap.trial_fim) - now())::integer
    END,
    (SELECT count(*) FROM public.medicos m WHERE m.clinica_id = c.id AND m.ativo),
    (SELECT count(*) FROM public.funcionarios f WHERE f.clinica_id = c.id),
    (SELECT count(*) FROM public.pacientes pa WHERE pa.clinica_id = c.id),
    (SELECT count(*) FROM public.agendamentos ag WHERE ag.clinica_id = c.id),
    NULLIF(at.ultima, 'epoch'::timestamptz),
    CASE WHEN at.ultima = 'epoch'::timestamptz THEN NULL
         ELSE EXTRACT(day FROM now() - at.ultima)::integer
    END
  FROM public.clinicas c
  LEFT JOIN public.profiles p ON p.id = c.owner_id
  LEFT JOIN public.assinaturas_plano ap ON ap.user_id = c.owner_id
  LEFT JOIN public.planos pl ON pl.id = ap.plano_id
  JOIN atividade at ON at.cid = c.id
  ORDER BY COALESCE(ap.data_fim, ap.trial_fim) NULLS LAST, c.nome;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.platform_crm_overview() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.platform_crm_overview() TO authenticated;

COMMENT ON FUNCTION public.platform_crm_overview() IS
  'Visão de clientes da plataforma: receita, vencimento, contato e atividade. Levanta exceção para quem não é dono da plataforma — devolver vazio faria o CRM parecer sem clientes.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- Como dono da plataforma, deve listar todas as clínicas:
--   SELECT clinica_nome, plano_valor, dias_para_vencer, dias_sem_uso
--     FROM public.platform_crm_overview();
--
-- Como qualquer outro usuário, deve dar erro — não lista vazia.
