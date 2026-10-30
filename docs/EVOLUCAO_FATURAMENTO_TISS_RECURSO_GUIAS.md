# Faturamento TISS: guias e glosas em páginas próprias

Data: 30/10/2026
Commit: `ef6509b498a0abd4605f74a29aa5ab43dac2d050`

## Diagnóstico

A conferência de guias, a preparação de recursos e o registro das decisões da operadora ainda interrompiam a lista de faturamento em diálogos. A conferência pode envolver muitas guias e pendências; o recurso reúne justificativa, prazo, responsável e documentos; a decisão exige conferir o valor realmente recuperado.

## Implementação

- `/faturamento-convenios/lotes/:loteId/guias` substitui `GuiasLoteDialog`. A página consulta o lote, guias e autorizações no escopo da clínica; valida campos e consistência; permite incluir ou remover guias apenas enquanto o lote está em rascunho; e fica somente para leitura depois do envio.
- `/faturamento-convenios/glosas/:glosaId/recurso` substitui `RecursoGlosaDialog`. Mantém a justificativa, o prazo, o responsável financeiro, os anexos PDF/JPEG/PNG de até 10 MB e a abertura por URL assinada.
- `/faturamento-convenios/glosas/:glosaId/retorno` substitui o diálogo de decisão. Registra recurso aceito e valor recuperado, inclusive recuperação parcial, ou registra a glosa mantida por valor zero.
- As três rotas mantêm o acesso `admin`/`financeiro`, filtram os registros pela clínica, ocultam identificadores internos no breadcrumb e retornam à lista preservando aba e filtros.
- A inclusão de guias confere o número no lote antes de repetir uma gravação incerta. A decisão da operadora confere novamente o estado persistido para reconhecer uma confirmação que perdeu a resposta, sem repetir uma alteração já concluída.
- Se o upload de documento tiver sucesso e a gravação dos metadados falhar, a página preserva o caminho e permite repetir somente a gravação dos metadados.
- A preparação usa duas RPCs existentes (`atualizar_glosa_convenio` e `definir_recurso_glosa`), portanto o salvamento de justificativa/status e prazo/responsável não é atômico. A página mantém o formulário e permite repetir os mesmos dados se a segunda etapa falhar.
- Foram removidos os diálogos antigos e seus testes unitários. Permanecem apenas confirmações curtas para registrar envio oficial e excluir uma guia do rascunho.

Nenhum contrato, permissão, RPC, migration ou dado de produção foi alterado. A transmissão de arquivo TISS continua fora do EloLab.

## Validação

- Playwright: 19/19 cenários dos fluxos TISS de lote, retorno, glosa, preparação, documentos, decisão e conferência de guias.
- Vitest: 25/25 testes de breadcrumbs.
- TypeScript, `npm run check:a11y` e `git diff --check` passaram.
- ESLint sem erros; há avisos de tipos genéricos e dependências de hooks nos arquivos do módulo.
- Capturas reais renderizadas foram inspecionadas em desktop e mobile: `test-results/tiss-appeal-page-desktop.png`, `test-results/tiss-appeal-page-mobile.png`, `test-results/tiss-glosa-decision-page-mobile.png`, `test-results/tiss-guides-workspace-desktop.png` e `test-results/tiss-guides-workspace-mobile-edit.png`. A ação principal do formulário mobile fica acima da navegação inferior, sem rolagem horizontal.
- Todas as gravações de QA foram interceptadas com dados sintéticos; nenhum lote, recurso, documento ou retorno real foi gravado. Não houve teste manual com leitor de tela nem validação de RLS numa sessão de produção.

## Publicação

- Imagem: `easypanel/elolab/app:deploy-20261030-ef6509b`.
- `/healthz` respondeu `ok`; `/version.json` confirmou o SHA integral acima; o Swarm convergiu com uma réplica ativa.
- A configuração `.env` do servidor foi preservada e comparada sem imprimir ou incluir seus valores. Nenhuma migration ou alteração de dados foi aplicada.
- Rollback imediato: `easypanel/elolab/app:deploy-20261030-84b4eac`.

## Continuidade

Esta entrega conclui os diálogos operacionais restantes do fluxo TISS. A migração das demais experiências do EloLab continua em andamento; não representa redesign nem auditoria integral do produto.
