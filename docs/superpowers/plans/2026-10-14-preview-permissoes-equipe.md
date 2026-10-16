# Melhoria #74: prévia de acesso por papel

## Escopo

Na seleção de papéis do cadastro/edição de funcionário e do convite, mostrar as áreas e telas que ficarão visíveis com a combinação escolhida. Derivar a prévia de `getFilteredMenuGroups`, a mesma regra usada pela navegação. Explicar que permissões de dados continuam aplicadas pelo servidor/RLS. Sem alterar autorizações ou gravar configuração.

## Validação

1. Testar combinações de papéis e garantir que não aparecem módulos de plataforma; confirmar falha inicial.
2. Construir a prévia acessível, vinculá-la aos dois formulários e atualizar enquanto papéis mudam.
3. Executar testes focados, checks estáticos, TypeScript e build.

## Aceite

- Nenhuma prévia antes de selecionar papel; combinação vazia informa que faltam papéis.
- Prévia lista módulos do app por área e acompanha seleções/desseleções.
- Cálculo usa a regra real do menu e não promete acesso aos dados além do RLS.
