-- Executar somente em banco de teste, após a migration 20261103200100.
-- Não depende de pacientes reais e desfaz todas as alterações.
BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'prontuarios'
        AND column_name IN ('alertas_seguranca', 'justificativa_alerta', 'tipo_receita')) <> 3 THEN
    RAISE EXCEPTION 'Faltam colunas do módulo 2';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
CREATE TEMP TABLE verificacao_alertas (
  id integer, alertas_seguranca jsonb, justificativa_alerta text,
  alerta_confirmado_por uuid, alerta_confirmado_em timestamptz
);
CREATE TRIGGER validar_alertas BEFORE INSERT OR UPDATE ON verificacao_alertas
FOR EACH ROW EXECUTE FUNCTION public.validar_auditoria_alerta_prescricao();

INSERT INTO verificacao_alertas (id, alertas_seguranca, justificativa_alerta)
VALUES (1, '[{"id":"interaction-0","severity":"warning","canIgnore":true}]',
        'Risco avaliado com monitoramento clínico programado.');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM verificacao_alertas
    WHERE justificativa_alerta = 'Risco avaliado com monitoramento clínico programado.'
      AND alerta_confirmado_por = auth.uid() AND alerta_confirmado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'Justificativa não preservada';
  END IF;
  BEGIN
    INSERT INTO verificacao_alertas (id, alertas_seguranca, justificativa_alerta)
    VALUES (2, '[{"id":"interaction-0","severity":"warning","canIgnore":true}]', 'ok');
    RAISE EXCEPTION 'Aceitou justificativa curta';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE verificacao_alertas SET justificativa_alerta = 'Outra justificativa para substituir a anterior.' WHERE id = 1;
    RAISE EXCEPTION 'Permitiu sobrescrever auditoria';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

CREATE TEMP TABLE verificacao_assinado (assinado boolean, justificativa_alerta text, tipo_receita text);
INSERT INTO verificacao_assinado VALUES (true, 'Justificativa original', 'simples');
CREATE TRIGGER proteger_assinado BEFORE UPDATE OR DELETE ON verificacao_assinado
FOR EACH ROW EXECUTE FUNCTION public.prevent_signed_prontuario_change();
DO $$
DECLARE bloqueado boolean := false;
BEGIN
  BEGIN
    UPDATE verificacao_assinado SET tipo_receita = 'controle_especial';
  EXCEPTION WHEN raise_exception THEN bloqueado := true;
  END;
  IF NOT bloqueado THEN RAISE EXCEPTION 'Alterou evolução assinada'; END IF;
  bloqueado := false;
  BEGIN
    DELETE FROM verificacao_assinado;
  EXCEPTION WHEN raise_exception THEN bloqueado := true;
  END;
  IF NOT bloqueado THEN RAISE EXCEPTION 'Excluiu evolução assinada'; END IF;
END;
$$;

-- CID-10 não verificado: download oficial recusou conexão; carga não gerada.
ROLLBACK;
