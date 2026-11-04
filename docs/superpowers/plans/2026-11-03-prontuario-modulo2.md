# Módulo 2 — plano de implementação

Execução sequencial no worktree atual, usando writing-plans, executing-plans e TDD.
Especificação: `docs/analise-modulos/02-prontuario.md`, seção Escopo aprovado.

Arquitetura: preservar o formulário e seus bloqueios; centralizar apenas as regras e componentes compartilhados pedidos. React, TypeScript, Vitest, PostgreSQL e Playwright existentes, sem dependências novas.

## Ordem e verificações

- [x] 2: `AtalhosDocumentos` aguarda salvamento do pai antes das quatro ações. Testes de componente cobrem sucesso, falha e vínculos. Reutilizada a proteção de versão de `handleScheduleReturn`; trava contra clique concorrente.
- [x] 3: `clinicalAlerts` concentra alergia, interações e contraindicações; ambos os fluxos usam o mesmo resultado. Testados varfarina/AAS, gestação/isotretinoína e persistência da justificativa. Preservados autosave de rascunhos e bloqueio de assinados.
- [ ] 1: interrompido conforme instrução após falha no download oficial. `https://www2.datasus.gov.br/cid10/V2008/downloads/CID10CSV.zip` recusou a conexão (WinError 10061). Nenhuma carga parcial, migration CID ou teste de volume foi criado.
- [x] 4: assinatura sugerida após salvar, com opção de pular; rascunhos antigos destacados. Testados limite de 24 h desde a criação e ação de pular assinatura.
- [x] 5: mesmo gerador tipado nos dois fluxos. Testados texto dos três tipos, duas vias e endereço.
- [x] 6: exame único com contexto, próximo paciente do médico, resumo sem nome/nascimento no topo, ordem móvel, vocabulário e helpers/campos compartilhados. Testes das regras extraídas e specs afetados.
- [x] Revisão própria, tsc, Vitest completo e Playwright clínico com porta 4191 e um worker. Vite encerrado. Commit ao concluir, sem push.

## Restrições e riscos a verificar

Sem Docker, WSL, Supabase local, produção, credenciais, cobrança ou módulos financeiros. Migrations com BEGIN/COMMIT, não aplicadas; verificação SQL com ROLLBACK. Sem subagentes ou processos de teste paralelos. UTF-8 preservado. Nenhum item fora do lote.

Verificar: edição durante save; falha parcial de prescrição; evolução já assinada; contexto clínico não carregado; retorno de documento/assinatura sem perda do vínculo. Conferir dependências de publicação antes da entrega.

## Validação final

- `npx tsc --noEmit -p tsconfig.app.json`: passou, sem erros.
- `npx vitest run`: passou, 2.361 testes e nenhuma falha.
- Playwright: somente `prontuario-return-page.spec.ts`, `prescription-pages.spec.ts` e `prescriptions-workspace.spec.ts`, `PLAYWRIGHT_PORT=4191`, `--workers=1`. Última rodada completa: 29 passaram e um falhou por seletor antigo do contador. Após corrigir esse seletor, o caso reexecutado passou; 30 cenários validados. O arquivo de incidentes que também casa com a substring `cid` foi excluído por não ser clínico.
- `git diff --check`: passou. Porta 4191 sem servidor ativo.
- `supabase/verificacoes/prontuario-20261103.sql`: preparado com ROLLBACK, não executado. Migration não aplicada; edge function não publicada.

## Ordem de publicação

Aplicar `20261103200100_prontuario_alertas.sql` antes de publicar o front. Não houve publicação nesta tarefa.

- **Prontuário (`/prontuarios/*`, incluindo atendimento):** INSERT/UPDATE em `public.prontuarios` passa a enviar `alertas_seguranca`, `justificativa_alerta` e `tipo_receita`. Sem migration, os campos inexistentes fazem falhar salvar manualmente, autosave, salvar e finalizar, atalhos/retorno que precisem salvar e PDF com rascunho alterado. As consultas de leitura existentes continuam funcionando.
- **Nova prescrição (`/documentos-clinicos/nova-prescricao`, acessível por Documentos clínicos e pelo redirecionamento de `/prescricoes`):** as colunas já existiam em `prescricoes`, mas o trigger antigo apaga a justificativa de overrides de avisos que não sejam de alergia. A emissão pode funcionar com perda dessa auditoria. A migration amplia a regra do trigger antes do novo front.
- **Edge `patient-clinical-summary`:** não depende de nenhum campo novo; pode ser publicada independentemente. Nenhuma outra edge function foi alterada nem ganhou dependência desta migration.

Fora deste lote: todos os itens explicitamente excluídos na especificação; CID-10 bloqueado pelo download oficial. Não houve mudanças em dependências, credenciais, cobrança ou financeiro de pacientes.
