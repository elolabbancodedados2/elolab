-- Check if column exists before adding to avoid errors
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lancamentos' AND column_name='frequencia_pagamento') THEN
        ALTER TABLE public.lancamentos ADD COLUMN frequencia_pagamento TEXT DEFAULT 'unica';
        COMMENT ON COLUMN public.lancamentos.frequencia_pagamento IS 'Frequência do pagamento: unica, mensal, quinzenal, semanal';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lancamentos' AND column_name='data_emprestimo') THEN
        ALTER TABLE public.lancamentos ADD COLUMN data_emprestimo DATE;
        COMMENT ON COLUMN public.lancamentos.data_emprestimo IS 'Data em que o valor foi emprestado ou originado';
    END IF;
END $$;

-- Ensure "programado" status exists in status_pagamento enum if possible
-- Note: PostgreSQL doesn't allow adding values to enums inside transaction blocks easily in some versions,
-- but since this is a migration we can try. However, most apps use 'pendente' for scheduled.
-- We will stick to the existing enum or check if we can extend it.
-- Based on previous context, status_pagamento is a custom type.

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_lancamentos_frequencia ON public.lancamentos(frequencia_pagamento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_data_emprestimo ON public.lancamentos(data_emprestimo);
