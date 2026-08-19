-- O produto não usa mais bloqueio global por modo de manutenção. A tabela é
-- preservada porque também armazena estado operacional e histórico.
UPDATE public.plataforma_estado SET manutencao = false WHERE id = true;
