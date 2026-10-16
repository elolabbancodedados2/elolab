# N1: Minha fila de trabalho

## Escopo

Nova rota autenticada para o usuário acompanhar tarefas atribuídas a si, separada do quadro da equipe. Consultas e atualização devem levar `clinica_id` e `responsavel_id` ao PostgREST; não criar tabelas nem migrations. Agrupar atrasadas, hoje, próximas, sem prazo e concluídas com ordenação determinística, estado vazio que distingue ausência de atribuições de fila concluída, link para o paciente conforme o papel e ação segura para concluir.

## Etapas

1. Testar agrupamento, fronteiras de data e desempate determinístico antes da implementação.
2. Testar a página: escopo tenant/usuário, estados de carregamento/erro/vazio, ação de concluir com precondição `updated_at` e navegação por link.
3. Implementar helper, página, rota e item de menu.
4. Validar testes focados, checks de permissões, typecheck, build e jornada Playwright sintética sem gravações clínicas reais.

## Aceite

- A fila só inclui tarefas atribuídas ao usuário autenticado na clínica ativa.
- Contadores derivam do mesmo resultado paginado e distinguem tarefas vencidas, hoje, futuras, sem prazo e concluídas.
- Concluir é condicionado à clínica, responsável e versão lida; conflitos não sobrescrevem atualizações concorrentes.
- Não há mudanças em finanças de pacientes nem schema.
