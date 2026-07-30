-- ============================================================================
-- Enfermagem via a tela de pacientes e não conseguia cadastrar
--
-- A rota /pacientes libera admin, recepcao e enfermagem. Mas o insert em
-- `pacientes` só aceitava can_manage_data (admin, recepcao) ou is_medico —
-- enfermagem ficava de fora.
--
-- Efeito: a enfermeira abria a tela, clicava em novo paciente, preenchia e
-- levava erro. Todo dia, num fluxo básico.
--
-- Aparece também nas Guias Externas: "Enviar para fila" e "Gerar agendamento"
-- criam o paciente a partir dos dados da guia quando ele ainda não existe
-- (src/pages/GuiasExternas.tsx). A rota /guias-externas também libera
-- enfermagem, então os dois fluxos falhavam pelo mesmo motivo.
--
-- Cadastrar paciente é recepção — administrativo, não clínico. Enfermagem faz
-- triagem e atende quem chega sem passar pela recepção; recusar o cadastro
-- obriga a chamar outra pessoa para digitar. O escopo por clínica continua
-- garantido pela própria política.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS pacientes_insert ON public.pacientes;
CREATE POLICY pacientes_insert ON public.pacientes
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.can_manage_data(auth.uid())   -- admin, recepcao
      OR public.is_medico(auth.uid())
      OR public.is_enfermagem(auth.uid())
    )
    AND (clinica_id = public.get_my_clinica_id() OR clinica_id IS NULL)
  );

COMMENT ON POLICY pacientes_insert ON public.pacientes IS
  'Inclui enfermagem porque as rotas /pacientes e /guias-externas já a admitem, e o cadastro é o primeiro passo dos dois fluxos. Sem isso a tela abria e o salvamento falhava.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- SELECT with_check FROM pg_policies
--  WHERE schemaname='public' AND tablename='pacientes' AND cmd='INSERT';
-- Deve citar can_manage_data, is_medico e is_enfermagem.
--
-- E não pode existir mais de uma política de INSERT — duas políticas
-- permissivas para a mesma operação se somam com OU e a mais frouxa vence:
-- SELECT count(*) FROM pg_policies
--  WHERE schemaname='public' AND tablename='pacientes' AND cmd='INSERT';
