-- 0) Deduplicar consultas conflitantes de seed (mantém a mais antiga)
WITH dup AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY medico_id, data, hora_inicio
           ORDER BY created_at
         ) AS rn
  FROM public.agendamentos
  WHERE status IS DISTINCT FROM 'cancelado'::status_agendamento
    AND medico_id IS NOT NULL
)
UPDATE public.agendamentos a
SET status = 'cancelado'::status_agendamento,
    observacoes = COALESCE(observacoes, '') ||
      CASE WHEN COALESCE(observacoes,'') = '' THEN '' ELSE E'\n' END ||
      '[auto] cancelada por duplicidade ao ativar proteção anti-sobreposição'
FROM dup
WHERE dup.id = a.id AND dup.rn > 1;

-- 1) Anti-overlap
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_sem_sobreposicao;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_sem_sobreposicao
  EXCLUDE USING gist (
    medico_id WITH =,
    data WITH =,
    tsrange(
      (data + hora_inicio)::timestamp,
      (data + COALESCE(hora_fim, hora_inicio + interval '30 minutes'))::timestamp,
      '[)'
    ) WITH &&
  )
  WHERE (status IS DISTINCT FROM 'cancelado'::status_agendamento AND medico_id IS NOT NULL);

-- 2) RLS de medico_disponibilidade
DROP POLICY IF EXISTS "Clinics can manage their doctors' availability" ON public.medico_disponibilidade;
DROP POLICY IF EXISTS "Clinics can view their doctors' availability" ON public.medico_disponibilidade;

CREATE POLICY "medico_disponibilidade_select"
  ON public.medico_disponibilidade FOR SELECT
  TO authenticated
  USING (
    medico_id IN (
      SELECT m.id FROM public.medicos m
      WHERE m.clinica_id = public.get_my_clinica_id()
    )
  );

CREATE POLICY "medico_disponibilidade_write_admin_or_owner"
  ON public.medico_disponibilidade FOR ALL
  TO authenticated
  USING (
    medico_id IN (
      SELECT m.id FROM public.medicos m
      WHERE m.clinica_id = public.get_my_clinica_id()
        AND (public.is_admin(auth.uid()) OR m.user_id = auth.uid())
    )
  )
  WITH CHECK (
    medico_id IN (
      SELECT m.id FROM public.medicos m
      WHERE m.clinica_id = public.get_my_clinica_id()
        AND (public.is_admin(auth.uid()) OR m.user_id = auth.uid())
    )
  );