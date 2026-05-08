-- Grant execute on remaining functions if any
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND (routine_name LIKE 'has_%' OR routine_name LIKE 'is_%' OR routine_name LIKE 'get_%' OR routine_name LIKE 'can_%')
    LOOP
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || func_record.routine_name || ' TO authenticated, anon';
    END LOOP;
END $$;

-- Fix potential missing RLS on specific tables identified in linter
ALTER TABLE IF EXISTS public.caixa_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.autorizacoes_convenio ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.avaliacoes_atendimento ENABLE ROW LEVEL SECURITY;

-- Ensure all tables have basic access policies if they were missing
DO $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        -- Simple check to see if any policy exists
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = table_record.tablename AND schemaname = 'public') THEN
            EXECUTE 'CREATE POLICY "Users can view their clinic data" ON public.' || table_record.tablename || 
                    ' FOR SELECT TO authenticated USING (clinica_id IS NULL OR clinica_id = get_my_clinica_id())';
        END IF;
    END LOOP;
END $$;
