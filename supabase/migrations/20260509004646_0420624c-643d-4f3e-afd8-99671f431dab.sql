-- Tornar nullable colunas que precisarão de SET NULL para preservar histórico clínico
ALTER TABLE public.prescricoes ALTER COLUMN paciente_id DROP NOT NULL;
ALTER TABLE public.prescricoes ALTER COLUMN medico_id DROP NOT NULL;
ALTER TABLE public.atestados ALTER COLUMN paciente_id DROP NOT NULL;
ALTER TABLE public.atestados ALTER COLUMN medico_id DROP NOT NULL;
ALTER TABLE public.exames ALTER COLUMN paciente_id DROP NOT NULL;
ALTER TABLE public.encaminhamentos ALTER COLUMN medico_origem_id DROP NOT NULL;
ALTER TABLE public.prontuarios ALTER COLUMN medico_id DROP NOT NULL;

-- Recriar FKs de paciente como SET NULL (histórico) ou CASCADE (transitório)
ALTER TABLE public.prescricoes DROP CONSTRAINT IF EXISTS prescricoes_paciente_id_fkey,
  ADD CONSTRAINT prescricoes_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE SET NULL;
ALTER TABLE public.atestados DROP CONSTRAINT IF EXISTS atestados_paciente_id_fkey,
  ADD CONSTRAINT atestados_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE SET NULL;
ALTER TABLE public.exames DROP CONSTRAINT IF EXISTS exames_paciente_id_fkey,
  ADD CONSTRAINT exames_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE SET NULL;
ALTER TABLE public.lancamentos DROP CONSTRAINT IF EXISTS lancamentos_paciente_id_fkey,
  ADD CONSTRAINT lancamentos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE SET NULL;
ALTER TABLE public.triagens DROP CONSTRAINT IF EXISTS triagens_paciente_id_fkey,
  ADD CONSTRAINT triagens_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;
ALTER TABLE public.lista_espera DROP CONSTRAINT IF EXISTS lista_espera_paciente_id_fkey,
  ADD CONSTRAINT lista_espera_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;

-- Recriar FKs de medico como SET NULL (preserva histórico)
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_medico_id_fkey,
  ADD CONSTRAINT agendamentos_medico_id_fkey FOREIGN KEY (medico_id) REFERENCES public.medicos(id) ON DELETE SET NULL;
ALTER TABLE public.prontuarios DROP CONSTRAINT IF EXISTS prontuarios_medico_id_fkey,
  ADD CONSTRAINT prontuarios_medico_id_fkey FOREIGN KEY (medico_id) REFERENCES public.medicos(id) ON DELETE SET NULL;
ALTER TABLE public.prescricoes DROP CONSTRAINT IF EXISTS prescricoes_medico_id_fkey,
  ADD CONSTRAINT prescricoes_medico_id_fkey FOREIGN KEY (medico_id) REFERENCES public.medicos(id) ON DELETE SET NULL;
ALTER TABLE public.atestados DROP CONSTRAINT IF EXISTS atestados_medico_id_fkey,
  ADD CONSTRAINT atestados_medico_id_fkey FOREIGN KEY (medico_id) REFERENCES public.medicos(id) ON DELETE SET NULL;
ALTER TABLE public.exames DROP CONSTRAINT IF EXISTS exames_medico_solicitante_id_fkey,
  ADD CONSTRAINT exames_medico_solicitante_id_fkey FOREIGN KEY (medico_solicitante_id) REFERENCES public.medicos(id) ON DELETE SET NULL;
ALTER TABLE public.encaminhamentos DROP CONSTRAINT IF EXISTS encaminhamentos_medico_origem_id_fkey,
  ADD CONSTRAINT encaminhamentos_medico_origem_id_fkey FOREIGN KEY (medico_origem_id) REFERENCES public.medicos(id) ON DELETE SET NULL;
ALTER TABLE public.encaminhamentos DROP CONSTRAINT IF EXISTS encaminhamentos_medico_destino_id_fkey,
  ADD CONSTRAINT encaminhamentos_medico_destino_id_fkey FOREIGN KEY (medico_destino_id) REFERENCES public.medicos(id) ON DELETE SET NULL;
ALTER TABLE public.salas DROP CONSTRAINT IF EXISTS salas_medico_responsavel_fkey,
  ADD CONSTRAINT salas_medico_responsavel_fkey FOREIGN KEY (medico_responsavel) REFERENCES public.medicos(id) ON DELETE SET NULL;

-- Retornos/lista_espera de médico: CASCADE não faz sentido, SET NULL com nullable
ALTER TABLE public.retornos ALTER COLUMN medico_id DROP NOT NULL;
ALTER TABLE public.retornos DROP CONSTRAINT IF EXISTS retornos_medico_id_fkey,
  ADD CONSTRAINT retornos_medico_id_fkey FOREIGN KEY (medico_id) REFERENCES public.medicos(id) ON DELETE SET NULL;
ALTER TABLE public.retornos ALTER COLUMN paciente_id DROP NOT NULL;
ALTER TABLE public.retornos DROP CONSTRAINT IF EXISTS retornos_paciente_id_fkey,
  ADD CONSTRAINT retornos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;