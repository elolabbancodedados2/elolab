# Plano de ativação de clientes em página própria

Em 30/10/2026, a edição do acompanhamento de onboarding saiu do modal e passou para `/admin/onboarding/:clinicId`, protegida pela mesma autorização exclusiva da plataforma.

## Diagnóstico e direção

O formulário combinava etapa, próxima ação ou bloqueio, responsável e prazo. O modal ocupava a lista de acompanhamento e não oferecia espaço adequado para registrar uma atualização operacional. A página própria mantém o contexto da clínica, a prontidão automática e os dados do plano em uma única tarefa, com retorno à lista preservando busca e filtros.

## Implementação

- A edição continua usando `platform_update_onboarding`, com os mesmos campos, validação de próxima ação, prazo no fuso de São Paulo e responsável.
- O carregamento usa `platform_onboarding_overview`; falha, carregamento e clínica não encontrada têm estados próprios.
- Alterações ficam em memória e uma confirmação protege a navegação e a recarga antes do salvamento.
- Etapas e dados não foram colocados na URL. Nenhum contrato de API, permissão ou regra de negócio foi alterado.

## Validação

- Playwright: 2/2; edição/salvamento, preservação da busca, retorno após salvar e descarte de alterações foram testados com backend sintético.
- TypeScript, build, acessibilidade, permissões, falhas silenciosas, colunas e `git diff --check` passaram.
- Capturas renderizadas desktop e mobile foram inspecionadas; não há modal, overflow horizontal ou botão de salvamento encoberto pela navegação inferior.
- ESLint focal: zero erros; 8 avisos `no-explicit-any` já existentes na página.
- Nenhum dado real foi modificado e nenhuma migration foi executada.

## Publicação

Commit `8b043c432e1c95db7b12b67b3c94a321819f3c7b`; imagem `easypanel/elolab/app:deploy-20261030-8b043c4`. O domínio público respondeu `/healthz=200` e `/version.json` confirmou o SHA completo; Swarm ficou em 1/1. Rollback: `deploy-20261030-ade77ff4`. A fonte anterior foi preservada em `code.before-20261030-8b043c4`; o hash do `.env` permaneceu igual.
