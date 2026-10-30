# Limites de consumo em página própria

Em 30/10/2026, a edição das cotas de uma clínica saiu do modal e passou para `/admin/consumo/:clinicId/limites`, sob a mesma proteção exclusiva da plataforma.

## Diagnóstico e direção

O formulário alterava assentos, tokens mensais de IA e notificações mensais. Era uma operação de suporte com impactos distintos e avisos sobre o uso atual, grande demais para interromper a lista de consumo. A tela própria mostra a situação vigente, explica as consequências das cotas e mantém a busca ao retornar.

## Implementação

- O salvamento continua usando `platform_set_tenant_limits` com os três campos atuais.
- Validação informa o intervalo aceito e impede frações, valores vazios, valores negativos e números acima do limite do banco.
- Avisos destacam quando uma cota proposta fica abaixo do consumo observado e explicam os efeitos sem impedir uma decisão autorizada.
- Leitura, erro com nova tentativa e clínica não encontrada têm estados próprios.
- Busca e filtro são preservados na navegação; alterações não salvas ficam em memória e pedem confirmação ao sair.
- O breadcrumb omite o identificador da clínica, que não representa uma etapa útil de navegação.

## Validação

- Playwright: 2/2; salvamento sintético, validação, aviso abaixo do consumo, preservação da busca, confirmação ao sair e tentativa de recarregar após falha.
- TypeScript, build, acessibilidade, permissões, falhas silenciosas, colunas e `git diff --check` passaram.
- Captura mobile inspecionada; sem overflow horizontal ou ação coberta pela navegação inferior.
- ESLint focal: zero erros; 2 avisos `no-explicit-any` já existentes na página.
- Nenhuma cota real foi alterada e nenhuma migration foi executada.

## Publicação

Commit `f81a78c2a91d3821fddcf03aebf3dc634c6b3ac8`; imagem `easypanel/elolab/app:deploy-20261030-f81a78c`. O domínio respondeu `/healthz=200`, confirmou o SHA completo em `/version.json` e o Swarm ficou em 1/1. Rollback: `deploy-20261030-8b043c4`. Fonte anterior preservada em `code.before-20261030-f81a78c`; hash do `.env` inalterado.
