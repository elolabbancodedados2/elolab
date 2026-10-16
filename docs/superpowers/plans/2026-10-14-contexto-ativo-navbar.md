# Melhoria #71: contexto ativo no cabeçalho

## Escopo

Mostrar o nome da clínica e o papel principal já carregado no perfil autenticado, em um indicador compacto no cabeçalho e no cartão do menu de conta. Consultar somente `clinicas.nome`, com a clínica da sessão como filtro, cache por `clinica_id` e sem controles que alterem o contexto.

## Validação

1. Criar teste de cabeçalho com clínica/papel conhecidos e confirmar falha inicial.
2. Implementar query de leitura e rótulos acessíveis; manter fallback quando perfil/clínica ainda não carregou.
3. Executar testes focados, checks de acessibilidade/permissões, TypeScript e build.

## Critérios de aceite

- Clínica e papel ficam identificados antes de ações da conta.
- Cache fica separado por clínica; consulta só retorna nome da clínica da sessão.
- No mobile, o contexto continua visível no menu da conta.
