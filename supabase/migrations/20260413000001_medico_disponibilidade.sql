-- Create medico_disponibilidade table for doctor availability scheduling
CREATE TABLE IF NOT EXISTS public.medico_disponibilidade (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  dia_semana integer NOT NULL, -- 0-6 (Sunday to Saturday, or 1-7 for Mon-Sun)
  hora_inicio time NOT NULL, -- e.g., "08:00"
  hora_fim time NOT NULL, -- e.g., "18:00"
  duracao_consulta integer NOT NULL DEFAULT 30, -- in minutes
  intervalo_consultas integer NOT NULL DEFAULT 5, -- buffer between appointments in minutes
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT valid_time_range CHECK (hora_inicio < hora_fim),
  CONSTRAINT valid_day_of_week CHECK (dia_semana >= 0 AND dia_semana <= 6),
  CONSTRAINT valid_duration CHECK (duracao_consulta > 0),
  CONSTRAINT valid_interval CHECK (intervalo_consultas >= 0)
);

-- Create index for faster lookups
CREATE INDEX idx_medico_disponibilidade_medico_id ON public.medico_disponibilidade(medico_id);
CREATE INDEX idx_medico_disponibilidade_dia ON public.medico_disponibilidade(medico_id, dia_semana);

-- Enable RLS
ALTER TABLE public.medico_disponibilidade ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Clinics can view their doctors' availability"
  ON public.medico_disponibilidade
  FOR SELECT
  USING (
    medico_id IN (
      SELECT id FROM public.medicos
      WHERE clinica_id IN (
        SELECT clinica_id FROM public.usuarios WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Clinics can manage their doctors' availability"
  ON public.medico_disponibilidade
  FOR ALL
  USING (
    medico_id IN (
      SELECT id FROM public.medicos
      WHERE clinica_id IN (
        SELECT clinica_id FROM public.usuarios WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    medico_id IN (
      SELECT id FROM public.medicos
      WHERE clinica_id IN (
        SELECT clinica_id FROM public.usuarios WHERE id = auth.uid()
      )
    )
  );

-- Insert default availability (8am-6pm, Mon-Fri) for existing doctors
INSERT INTO public.medico_disponibilidade (medico_id, dia_semana, hora_inicio, hora_fim, duracao_consulta, intervalo_consultas)
SELECT
  id,
  dia,
  '08:00'::time,
  '18:00'::time,
  30,
  5
FROM public.medicos
CROSS JOIN (
  SELECT 1 as dia UNION ALL
  SELECT 2 UNION ALL
  SELECT 3 UNION ALL
  SELECT 4 UNION ALL
  SELECT 5
) days
ON CONFLICT DO NOTHING;

-- Update updated_at trigger
CREATE OR REPLACE FUNCTION update_medico_disponibilidade_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language plpgsql;

CREATE TRIGGER medico_disponibilidade_updated_at_trigger
BEFORE UPDATE ON public.medico_disponibilidade
FOR EACH ROW
EXECUTE FUNCTION update_medico_disponibilidade_updated_at();
