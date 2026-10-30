# Recepção — retorno contextual das tarefas

## Diagnóstico

Encaixe e recebimento já aconteciam em páginas próprias, mas seus botões de voltar e o retorno após salvar usavam `/recepcao` fixo. Isso podia descartar a aba que abriu a tarefa e não havia validação explícita do destino recebido pela rota.

## Implementação

- A origem local é carregada ao abrir encaixe ou pagamento e restaurada ao cancelar, voltar ou concluir.
- O retorno aceita apenas `/recepcao` e `/recepcao?tab=caixa`; links diretos, estado ausente ou destino inválido usam `/recepcao`.
- Fluxos de check-in, cobrança, encaixe, permissões, contratos de dados e confirmações críticas permanecem inalterados.

## Validação

- Vitest do novo helper: 3 cenários; testes da casca Recepção/Caixa: 2 cenários.
- Build de produção e verificações de acessibilidade, permissões, falhas silenciosas, colunas e `git diff --check` passaram.
- ESLint focal: 0 erros; os avisos existentes de `any` em `Recepcao.tsx` permanecem.
- A alteração é de navegação; não altera a composição renderizada. Não fiz captura visual nesta entrega.

## Publicação

Preencher após confirmar o commit, a imagem, o health check e a versão servida.
