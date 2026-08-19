ALTER TABLE public.plataforma_estado
  ALTER COLUMN titulo SET DEFAULT 'Banco de dados desconectado',
  ALTER COLUMN mensagem SET DEFAULT 'Não foi possível conectar ao banco de dados. O sistema tentará novamente automaticamente.';

UPDATE public.plataforma_estado
   SET titulo = 'Banco de dados desconectado',
       mensagem = 'Não foi possível conectar ao banco de dados. O sistema tentará novamente automaticamente.'
 WHERE id = true;
