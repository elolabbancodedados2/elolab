# Editar relatório salvo sem duplicar

## Achado da triagem #91

O isolamento por usuário e clínica e a restauração dos filtros já existem (políticas RLS e `RelatorioCustomizado`). Esse item já estava pronto e não será contado novamente. O fluxo, porém, sempre faz `INSERT` ao salvar; editar os filtros e salvar cria outro relatório, podendo duplicar o agendamento.

## Objetivo

Quando um usuário abrir um relatório próprio, permitir salvar os filtros e a configuração de envio no mesmo registro. Para relatório de outra pessoa aberto por administrador, oferecer cópia nova sem transferir propriedade.

## Segurança e comportamento

- Propagar apenas metadados necessários da linha autorizada até a navegação.
- Habilitar atualização somente para o proprietário; incluir `id`, `user_id` e `clinica_id` no filtro da mutação.
- Usar `updated_at` como compare-and-set para recusar gravação sobre uma edição concorrente.
- Preservar pausa/estado ativo ao atualizar; limpar campos de agendamento quando mudar para favorito sem envio.
- Manter o fluxo atual de criação para relatórios novos e cópias de terceiros.

## Validação

- Playwright sintético comprova prefill dos metadados e `PATCH` no registro próprio sem `INSERT`.
- Teste de contrato cobre filtros de identidade e clínica e limpeza da agenda ao salvar como favorito.
- TypeScript, build, checks de permissões/colunas/falhas/acessibilidade.

## Evidência

- Playwright sintético: 1/1; confirma prefill, PATCH com id/usuário/clínica/versão e limpeza de agenda sem reativar relatório pausado.
- Vitest de contrato: 3/3; além da suíte existente de segurança de relatórios, 3/3 passaram.
- TypeScript, build, checks de permissões/colunas/falhas/acessibilidade: aprovados.
- ESLint direcionado: 0 erros; 24 avisos `no-explicit-any` já presentes nas duas telas.
- Sem migration.
