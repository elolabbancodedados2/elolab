ALTER TABLE public.plataforma_estado
  ALTER COLUMN titulo SET DEFAULT 'Banco de dados Supabase não suportado',
  ALTER COLUMN mensagem SET DEFAULT 'Entre em contato com o suporte para atualizar para a nova versão e aplicar o SQL necessário.';

UPDATE public.plataforma_estado
   SET titulo = 'Banco de dados Supabase não suportado',
       mensagem = 'Entre em contato com o suporte para atualizar para a nova versão e aplicar o SQL necessário.'
 WHERE id = true;
