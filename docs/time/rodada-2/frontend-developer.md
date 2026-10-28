# Rodada 2: frontend-developer

Data: 27/10/2026. Sem deploy, sem migration e sem commit.

## 1. O que fiz

### CLIN-QA-545 (o prontuário mostra um paciente e grava em outro)

A auditoria confirma a falta da invariante (`docs/seguranca/auditoria-rodada-2.md:109-142`) e mantém o item como P0 suspeito. Apliquei os quatro itens da correção recomendada (`:144-149`):

1. **Guarda antes de gravar.** `performSave` recusa a gravação, com mensagem e sem nenhuma escrita, quando `currentProntuario.paciente_id !== selectedPacienteId` (`src/pages/Prontuarios.tsx:1204-1210`). Isso vale para o salvamento manual, o automático e a dispensação. O botão "Salvar Prontuário" também fica desabilitado nesse caso (`:2601`).
2. **O diálogo lê o paciente do registro.** `pacienteDoDialogo` só existe quando o paciente carregado é o mesmo do registro aberto (`:884-886`). O título, a identificação, o PDF, o WhatsApp, o retorno, o verificador de interação com as alergias, os anexos (`:2436`) e o motivo da baixa de estoque passam a usar esse paciente. Quando há divergência, o diálogo troca a identificação por um alerta (`role="alert"`) informando que a gravação está bloqueada.
3. **Clique no rascunho.** O clique agora incrementa `prescricoesRequestRef` (`:1711`), como a seleção comum. Assim, uma abertura do paciente A que ainda esteja em andamento é descartada (caminho H1).
4. **Troca de paciente com o diálogo aberto.** Um efeito fecha o diálogo quando não há alterações não salvas (`:1511-1518`). Quando há alterações, o diálogo fica travado: ninguém consegue gravar, e o descarte passa pela confirmação que já existe.

Achado no mesmo padrão, também corrigido: a solicitação de exame gravava `paciente_id: selectedPacienteId`. Agora ela usa o paciente do registro e recusa a solicitação se houver divergência (`:1547-1561`).

### CLIN-QA-401: identificação no prontuário em edição

A faixa antiga (badge em `text-[10px]`, idade "42a", CPF completo e selo "LGPD" sem função) foi trocada por `IdentificacaoPaciente` na variante `dialogo` (`Prontuarios.tsx:2110`). Ela fica fora da área que rola e tem os estados de carregamento, de erro com "Tentar novamente" e de carregado. A conversão do cadastro para o componente está em `paraIdentificacao` (`src/lib/pacienteDoRegistro.ts`): ela transforma a lista vazia de `pacientes.alergias` em `null` ("Alergias não informadas"), conforme `docs/ux/telas/identificacao-paciente.md` §5.3. O convênio continua sendo exibido.

### CLIN-QA-402: identificação no pagamento da Recepção

O diálogo "Confirmar Pagamento" agora mostra `IdentificacaoPaciente` com `variante="dialogo"` e `contexto="cobranca"` logo abaixo do título (`src/pages/Recepcao.tsx:1528`). Os dados vêm de `selectedPacienteBalcao`, que é definido junto com o lançamento em `openPagamento`. Só existe um diálogo de pagamento no arquivo atual. O segundo, citado na especificação em `:1712`, não existe mais: o diálogo em `:1763` é o do encaixe.

## 2. Arquivos tocados

- `src/pages/Prontuarios.tsx` (só os trechos acima; as alterações locais de outras frentes foram preservadas)
- `src/pages/Recepcao.tsx` (import e diálogo de pagamento)
- `src/lib/pacienteDoRegistro.ts` (novo)
- `src/lib/__tests__/pacienteDoRegistro.test.ts` (novo)
- `docs/time/rodada-2/frontend-developer.md` (este arquivo)

## 3. Evidências

| Comando | Resultado |
|---|---|
| `npx vitest run src/lib/__tests__/pacienteDoRegistro.test.ts` | 1 arquivo, 13 testes passaram |
| `npx vitest run` com `pacienteDoRegistro`, `IdentificacaoPaciente`, `identificacaoPaciente` e `RecepcaoEncaixeStatus` | 4 arquivos, 44 testes passaram (antes de incluir os 3 testes de regressão da tela) |
| `npx eslint` nos 4 arquivos de código | 0 erros e 98 avisos (94 `no-explicit-any` e 4 `exhaustive-deps`), todos em Prontuarios e Recepcao. Não separei quais já existiam |
| `npm run check:a11y` | "OK: controles têm nome acessível e não há interativos aninhados." |
| `npm run check:falhas` | 0 casos |
| `npx tsc --noEmit -p tsconfig.app.json` | **Não executado.** Pela regra de recursos (`REGRAS_DO_TIME.md`), o `tsc` completo fica com o QA ou o tech-lead no fim da rodada |

Os testes cobrem a guarda (paciente igual, diferente ou ausente), a escolha do paciente do registro e a conversão das alergias. Também cobrem três regressões lidas do código-fonte de `Prontuarios.tsx`: a guarda vem antes da primeira escrita em `prontuarios`, o diálogo não referencia `selectedPaciente` nem `selectedPacienteId`, e o clique no rascunho incrementa `prescricoesRequestRef`.

**NÃO VERIFICADO:** o comportamento no app. A tela não foi aberta no navegador, e o H1 não foi reproduzido com a RPC de auditoria atrasada.

## 4. Pendências

| Pendência | Dono |
|---|---|
| `tsc` completo, `vitest` completo e lint da rodada | qa-engineer ou tech-lead |
| Teste de aceite do 545: simular H1 (RPC atrasada, rascunho de B indisponível) e conferir que o diálogo não abre com B e não grava | qa-engineer |
| Testes manuais da especificação §10 (1366 × 768, 360 × 640, NVDA, zoom de 200%) nos dois diálogos | qa-engineer |
| Convênio e carteirinha no diálogo de pagamento: o lançamento não traz o nome do convênio, e a especificação deixa isso para a fase 2 | frontend-developer, fase 2 |
| A identificação e as alergias da ficha lateral (`FichaPaciente`, `ClinicalSafetyPanel`) continuam vindo de `selectedPaciente`, o que está correto fora do diálogo. As demais telas de prioridade 1 e 2 (Prescrições, Caixa diário, Triagem) ainda não foram integradas | frontend-developer, próxima rodada |
| Texto com codificação corrompida (`NÃ£o foi possÃ­vel`) em `Prontuarios.tsx` (P3, já existia em `HEAD`). Ficou fora do escopo | frontend-developer |
| Campo para confirmar as alergias, que distingue "nega" de "não perguntado" | business-analyst e database-engineer |

## 5. Próximo dono

qa-engineer, para a verificação completa da rodada e o teste de aceite do CLIN-QA-545.
