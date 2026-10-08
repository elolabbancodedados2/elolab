CREATE OR REPLACE FUNCTION public.bloquear_escrita_operacional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.platform_operational_state%ROWTYPE;
BEGIN
  -- Administradores precisam continuar podendo corrigir a plataforma durante
  -- o bloqueio global. O modo permanece aplicado a contas de clínicas.
  IF auth.uid() IS NOT NULL AND public.is_platform_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM public.platform_operational_state WHERE id = true;
  IF s.bloqueio_emergencial THEN
    RAISE EXCEPTION 'Plataforma temporariamente indisponível: %',
      coalesce(s.mensagem, 'bloqueio emergencial') USING errcode = '55000';
  END IF;
  IF s.somente_leitura THEN
    RAISE EXCEPTION 'Plataforma em modo somente leitura: %',
      coalesce(s.mensagem, 'alterações suspensas') USING errcode = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'agendamentos', 'anexos_prontuario', 'atestados', 'autorizacoes_convenio',
    'bloqueios_agenda', 'caixa_diario', 'caixa_diario_eventos',
    'coletas_laboratorio', 'configuracoes_clinica', 'consentimentos_lgpd',
    'convenios', 'encaminhamentos', 'estoque', 'exames', 'fila_atendimento',
    'glosas_convenio', 'guias', 'guias_externas', 'lancamento_itens',
    'lancamentos', 'lista_espera', 'lotes_tiss', 'medico_disponibilidade',
    'movimentacoes_estoque', 'pagamentos', 'pagamentos_mercadopago',
    'paciente_comorbidades', 'pacientes', 'prescricoes', 'prontuario_adendos',
    'prontuario_assinaturas', 'prontuarios', 'repasses_medicos',
    'resultados_laboratorio', 'retornos', 'salas', 'tarefas', 'triagens',
    'tipos_consulta', 'tipos_exame_custom'
  ] LOOP
    IF to_regclass('public.' || tabela) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_controle_operacional ON public.%I', tabela);
      EXECUTE format(
        'CREATE TRIGGER trg_controle_operacional BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bloquear_escrita_operacional()',
        tabela
      );
    END IF;
  END LOOP;
END;
$$;
