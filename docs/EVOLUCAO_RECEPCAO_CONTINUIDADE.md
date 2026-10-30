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

Commit `94315b9431166c41877c4b90d476c7a8cd917d5a`; imagem `easypanel/elolab/app:deploy-20261030-94315b9`. O smoke isolado passou; a única réplica do Swarm convergiu e a versão publicada respondeu `healthz=ok` com o SHA integral confirmado. Houve contenção transitória da porta em modo host durante o rollout, resolvida sem rollback. Rollback preservado: `deploy-20261030-8245ac7`; código anterior preservado em `code.before-20261030-94315b9`. Nenhuma migration ou gravação em dados de produção.
