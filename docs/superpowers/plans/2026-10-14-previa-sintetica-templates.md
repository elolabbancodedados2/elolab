# Prévia sintética de modelos de comunicação

## Objetivo

Exibir valores de exemplo para variáveis reconhecidas, destacar placeholders sem suporte para a categoria e exigir revisão antes de ativar um modelo de e-mail.

## Implementação

- Extrair catálogo de valores sintéticos e suporte de variáveis por categoria para `src/lib/templatePreview.ts`.
- Não usar dados de pacientes; escapar substituições antes de renderizar conteúdo HTML.
- Mostrar variáveis pendentes no editor e em modelos já ativos com placeholders incompatíveis.
- Abrir prévia antes da ativação e bloquear a confirmação quando houver variável ausente.
- Permitir desativar diretamente e editar um modelo inválido a partir da revisão.

## Validação

- Vitest: 4/4 testes para substituição, detecção de placeholder desconhecido, incompatibilidade por categoria e escape de HTML.
- Playwright sintético: 2/2 jornadas; modelo inválido permanece bloqueado e modelo válido ativa somente depois da prévia.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado.
- ESLint direcionado: 0 erros; 6 avisos `no-explicit-any` existentes no componente.
- `git diff --check`: aprovado.
- Sem migration, chamada a dados reais, ou alteração em produção.
