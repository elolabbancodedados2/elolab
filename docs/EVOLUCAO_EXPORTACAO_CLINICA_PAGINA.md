# Proteção de exportações clínicas

## Diagnóstico

O passo final de exportação protegida pedia senha e confirmação em um diálogo dentro de Interoperabilidade e do Prontuário. O formulário era curto, mas encobria o contexto e podia quase ocupar a tela no mobile.

## Direção e implementação

- A proteção agora abre uma página própria nos dois módulos, com arquivo e tipo claramente identificados.
- A URL guarda somente `workflow=proteger-exportacao`. O Bundle ou prontuário permanece em memória na página de origem; conteúdo clínico, senha e arquivo não são colocados na URL, no estado do histórico ou em armazenamento local.
- Recarregar a página ou abrir o marcador sem o conteúdo em memória exibe uma recuperação segura e pede que a pessoa gere a exportação novamente.
- Criptografia AES-GCM, derivação PBKDF2, senha mínima de 12 caracteres, confirmação, nome do arquivo e formato `.elolab` permanecem compatíveis.
- No Prontuário, a auditoria existente continua sendo registrada antes do download; falha de auditoria mantém o formulário aberto e bloqueia o arquivo.
- Senhas divergentes, erro de criptografia e falha de auditoria são apresentados na própria página. O retorno restaura o foco no botão de exportação quando disponível.

## Arquivos

- `src/components/clinical/ExportacaoClinicaProtegida.tsx`
- `src/components/clinical/__tests__/ExportacaoClinicaProtegida.test.tsx`
- `src/pages/Interoperabilidade.tsx`
- `src/pages/Prontuarios.tsx`
- `tests/clinical-protected-export-page.spec.ts`

## Validação

- Playwright Chromium: 2/2 cenários passaram. O teste principal exporta um Bundle sintético, protege e baixa o arquivo; o segundo valida recuperação após recarga nos dois módulos.
- Vitest: 3/3 cenários passaram para validação de senha, download e falha auditável.
- Capturas efetivamente inspecionadas em 390×844 e 1440×960; no mobile os campos e ações finais ficam acessíveis por rolagem, sem sobreposição da navegação inferior.
- TypeScript, build, acessibilidade, permissões, falhas silenciosas e colunas passaram.
- ESLint: zero erros; 59 avisos `no-explicit-any` já existentes em `Prontuarios.tsx`.

## Limites e publicação

Não houve mudança de contrato, migration ou uso de dados clínicos reais. A validação usou Bundle e conta sintéticos. Identificador da imagem, smoke test, rollback e checagem pública serão registrados após a publicação.
