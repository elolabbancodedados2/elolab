UPDATE public.plataforma_estado
   SET manutencao = true,
       titulo = 'Estamos fazendo a migração para SQL',
       mensagem = 'A plataforma está temporariamente indisponível enquanto os dados são atualizados para a nova versão.'
 WHERE id = true;
