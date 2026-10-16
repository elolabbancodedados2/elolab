# Incremento: filtro Minhas tarefas

## Escopo

Adicionar à página existente de tarefas um filtro acessível que restringe a lista às tarefas atribuídas ao usuário autenticado, preservando busca textual e status. Sem mudança de esquema, migrations ou alterações de dados; o carregamento continua restrito à clínica ativa.

## Etapas e validação

1. Adicionar testes unitários para o seletor de atribuição e um teste de interação para composição com os filtros atuais; confirmar falha inicial.
2. Implementar o seletor e o controle na interface, com estado claro e opção de limpar.
3. Executar os testes focados, suíte completa, typecheck e verificações estáticas; validar a página com o backend sintético antes de registrar a melhoria.

## Critérios de aceite

- Usuário autenticado vê apenas tarefas atribuídas ao próprio ID quando o filtro está ativo.
- Busca e status continuam compondo o resultado; botão de limpar remove também o filtro pessoal.
- Sem usuário autenticado, o filtro pessoal não exibe tarefas.
- Não há chamadas de escrita nem mudanças de tenant ou finanças.
