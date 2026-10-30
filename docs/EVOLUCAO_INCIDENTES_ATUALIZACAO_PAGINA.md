# Atualização de incidentes em página própria

Em 30/10/2026, a atualização de status e linha do tempo saiu do modal e passou para `/admin/incidentes/:incidentId/atualizar`, sob a mesma proteção exclusiva da plataforma.

## Diagnóstico e direção

A tarefa reúne a mudança de estado do incidente e uma justificativa obrigatória que passa a compor a linha do tempo. A tela anterior escondia o histórico e o contexto operacional do registro. A página nova mantém título, impacto, severidade, estado atual e eventos ao lado do formulário.

## Implementação

- A gravação continua usando `platform_update_incident` com o mesmo identificador, status e mensagem.
- O status atual e a linha do tempo permanecem visíveis durante a edição; incidentes resolvidos explicam que o formulário prepara a reabertura em “Investigando”.
- A mensagem continua obrigatória, limitada a 2.000 caracteres e sem dados clínicos.
- Falha de leitura e registro não encontrado têm estados próprios; alterações não salvas pedem confirmação.
- Filtro da lista é restaurado no retorno; o identificador técnico é omitido do breadcrumb.

## Validação

- Playwright: 1/1; linha do tempo, mudança de status, payload da RPC, filtro preservado, proteção de rascunho e mobile foram verificados com backend sintético.
- TypeScript, build, acessibilidade, permissões, falhas silenciosas, colunas e `git diff --check` passaram.
- Captura mobile inspecionada; sem overflow horizontal ou ação coberta pela navegação inferior.
- ESLint focal: zero erros; 4 avisos `no-explicit-any` já existentes na página.
- Nenhum incidente real foi atualizado e nenhuma migration foi executada.

## Publicação

Commit `76c94c94caebd5f0ca8208c35ac198be4b0ba16f`; imagem `easypanel/elolab/app:deploy-20261030-76c94c9`. O domínio respondeu `/healthz=200`, confirmou o SHA completo em `/version.json` e o Swarm ficou em 1/1. Rollback: `deploy-20261030-f81a78c`. A fonte anterior foi preservada em `code.before-20261030-76c94c9`; hash do `.env` inalterado.
