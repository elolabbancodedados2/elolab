# Prescrições — revisão de segurança clínica em página própria

## Diagnóstico atual

Antes de emitir uma receita, alertas clínicos e a justificativa para riscos de alergia eram apresentados em um modal alto sobre o formulário. A revisão podia exigir leitura de vários alertas e bloqueava a tela do rascunho.

## Direção e implementação

- A etapa agora fica em `/documentos-clinicos/nova-prescricao?tela=alertas-seguranca` e mantém o rascunho, paciente e prescritor em memória no mesmo workspace.
- O foco vai para o título da revisão. Paciente, profissional, data, alertas e justificativa obrigatória ficam visíveis sem cobrir o formulário.
- Somente a transição entre o formulário e a revisão pode atravessar o bloqueio de alterações não salvas, e apenas quando os demais parâmetros da URL permanecem iguais.
- Alertas críticos não ignoráveis continuam bloqueando a emissão. Alertas que admitem decisão clínica preservam a justificativa mínima existente e o registro junto à prescrição.
- Um link direto ou uma sessão recarregada sem estado de revisão mostra recuperação para o formulário e não emite documentos.
- Não foram alteradas validações clínicas, regras de permissão, consultas, storage, payloads, tabelas ou auditoria.

## Validação

- Playwright da prescrição: 9/9 cenários passaram, incluindo alerta crítico, retorno ao rascunho, acesso direto sem estado e perfis/permissões existentes.
- Testes focados de segurança e navegação: 49/49 passaram.
- TypeScript sem erros; build de produção, acessibilidade, permissões, falhas silenciosas, colunas e `git diff --check` passaram.
- ESLint focal: 0 erros e 27 avisos existentes de `any`/dependências em `Prescricoes.tsx`.
- Capturas renderizadas em 390 px e 1440 px foram inspecionadas. Sem sobreposição ou rolagem horizontal; o foco fica no título e alertas críticos permanecem legíveis.
- Testes usam dados e gravações sintéticos; nenhuma prescrição real foi emitida.

## Arquivos

- `src/pages/Prescricoes.tsx`
- `src/components/UnsavedChangesGuard.tsx`
- `src/lib/prescriptionSafetyReviewNavigation.ts`
- `src/lib/__tests__/prescriptionSafetyReviewNavigation.test.ts`
- `tests/prescription-pages.spec.ts`

## Publicação

Preencher após confirmar commit, imagem, smoke isolado, estado do Swarm e versão pública.
