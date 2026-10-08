BEGIN;

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS recorrencia_origem_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_recorrencia_origem_unica
  ON public.lancamentos (recorrencia_origem_id)
  WHERE recorrencia_origem_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.gerar_proxima_despesa_recorrente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dias integer;
  v_meses integer;
  v_inicio_mes date;
  v_ultimo_dia date;
  v_proximo_vencimento date;
BEGIN
  IF NEW.tipo <> 'despesa'
     OR NEW.status IS DISTINCT FROM 'pago'::public.status_pagamento
     OR OLD.status IS NOT DISTINCT FROM NEW.status
     OR NOT COALESCE(NEW.recorrente, false)
     OR NEW.data_vencimento IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.frequencia_recorrencia
    WHEN 'semanal' THEN v_dias := 7;
    WHEN 'quinzenal' THEN v_dias := 14;
    WHEN 'mensal' THEN v_meses := 1;
    WHEN 'bimestral' THEN v_meses := 2;
    WHEN 'trimestral' THEN v_meses := 3;
    WHEN 'anual' THEN v_meses := 12;
    ELSE RETURN NEW;
  END CASE;

  IF v_dias IS NOT NULL THEN
    v_proximo_vencimento := NEW.data_vencimento + v_dias;
  ELSE
    v_inicio_mes := (date_trunc('month', NEW.data_vencimento)::date
      + make_interval(months => v_meses))::date;
    v_ultimo_dia := (v_inicio_mes + interval '1 month - 1 day')::date;
    v_proximo_vencimento := v_inicio_mes
      + LEAST(EXTRACT(day FROM NEW.data_vencimento)::integer,
              EXTRACT(day FROM v_ultimo_dia)::integer) - 1;
  END IF;

  INSERT INTO public.lancamentos (
    tipo, categoria, descricao, valor, data, data_vencimento, status,
    forma_pagamento, fornecedor, numero_documento, data_emissao,
    competencia, recorrente, frequencia_recorrencia, centro_custo,
    observacoes, clinica_id, recorrencia_origem_id
  ) VALUES (
    'despesa', NEW.categoria, NEW.descricao, NEW.valor,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    v_proximo_vencimento, 'pendente', NEW.forma_pagamento, NEW.fornecedor,
    NULL, v_proximo_vencimento, to_char(v_proximo_vencimento, 'YYYY-MM'),
    true, NEW.frequencia_recorrencia, NEW.centro_custo,
    NEW.observacoes, NEW.clinica_id, NEW.id
  )
  ON CONFLICT (recorrencia_origem_id)
    WHERE recorrencia_origem_id IS NOT NULL
    DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lancamentos_gerar_proxima_despesa_recorrente
  ON public.lancamentos;
CREATE TRIGGER lancamentos_gerar_proxima_despesa_recorrente
  AFTER UPDATE OF status ON public.lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.gerar_proxima_despesa_recorrente();

COMMENT ON COLUMN public.lancamentos.recorrencia_origem_id IS
  'Lançamento anterior que originou esta ocorrência recorrente; também impede gerar a mesma próxima conta mais de uma vez.';

COMMIT;
