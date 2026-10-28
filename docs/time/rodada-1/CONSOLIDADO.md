# Consolidado da rodada 1

Dono: `clinical-quality-director`. Data: 27/10/2026.
Base: os resumos em `docs/time/rodada-1/`, os critérios de `docs/time/GATES.md` e uma conferência por amostragem feita pelo diretor (seção 6).

**Situação: consolidado parcial.** Chegaram 11 dos 16 resumos esperados. Os cinco da leva 2 (`frontend-developer`, `product-designer`, `business-analyst`, `especialista-dominio-saude` e `growth-marketing`) ainda não têm resumo (`TAREFAS-LEVA-2.json`). Alguns artefatos deles já estão em disco, mas não foram avaliados. Este documento será atualizado quando os resumos chegarem.

## 1. Resumo para o responsável

- **Nenhum P0 fechou.** Nada foi aplicado em banco, publicado ou commitado. Quatro dos cinco P0 têm agora correção ou plano escrito, e dois deles têm teste local.
- **Um P0 suspeito novo:** CLIN-QA-545. A faixa do prontuário mostra um paciente, mas a gravação usa outro estado de paciente, sem conferência entre os dois. Ele bloqueia o gate até ser derrubado por teste. O CLIN-QA-512, também levantado como suspeito, foi conferido pelo diretor e rebaixado para P1 (seção 2).
- **O CI verde não prova nada sobre isolamento.** As três suítes de segurança terminam com `41 skipped` e código de saída 0 (qa-engineer). Além disso, as asserções passariam mesmo com o banco vazio (CLIN-QA-565).
- **As alterações de P0 estão misturadas** com cerca de 209 arquivos de outra frente na branch `feat/recepcao-painel-dia-melhorias`. Sem commits separados por item, a revisão e a reversão ficam inviáveis.
- **Decisões que travam o andamento**, todas do responsável:
  - rodar as consultas só leitura na VPS (C1);
  - decidir o que fazer com as conversas de WhatsApp vinculadas pelo telefone (C5);
  - escolher bucket, monitor e custódia de chaves do backup (devops D1 a D4);
  - obter o parecer do DPO sobre a anonimização.
- **Veredito: NO-GO mantido.** O gate de contenção de 7 dias não foi atingido (`docs/time/GATES.md`, seção 7).

## 2. Situação dos P0

| ID | Tema | Estado (`GATES.md` 1.1) | O que existe | O que falta para fechar |
|---|---|---|---|---|
| 001 | RPCs `SECURITY DEFINER` executáveis por anon | **correção escrita e testada localmente** (E2) | `supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql:73-142` corrige `link_portal_paciente`; `:148-250` corrige `platform_get_clinicas_saude`; `:253-323` faz a revogação em massa com allowlist; `:328-348` ajusta os privilégios padrão; `:351-380` aborta a transação se sobrar anon. PGlite 30 de 30 (database-engineer, não reexecutado pelo diretor) | C1 (consulta na VPS e comparação com a allowlist), as ressalvas da seção 4.5 da auditoria de segurança, backup e aplicação aprovada, e chamada anon retornando `42501` em homologação e em produção |
| 002 | Isolamento e RBAC sem prova | **aberto** | Causa encontrada: `scripts/test-supabase-env.ts:41-53` só lê `QA_*`, que o `.github/workflows/test.yml` não define, e o Playwright sai com 0 quando tudo é pulado. Proposta de job `security-e2e` em `docs/operations/ci-banco-efemero.md` e na seção 6 de `docs/qa/plano-regressao-rodada-1.md` | Implementar seed, `falhar-se-pulado`, correção das asserções (565), modo de teste do Vite (564) e prefixo de migration duplicado (563). Autorização para editar `.github/`, `tests/` e `scripts/qa/` |
| 003 | Paciente errado nos canais públicos | **correção escrita e testada localmente** (E2) | `supabase/functions/whatsapp-webhook/index.ts:182-189` cria a conversa sem vínculo; `:693` traz a regra 11 do prompt; `:896` é a ferramenta `identificar_paciente`. `supabase/functions/_shared/identificacaoPaciente.ts` é novo. `public-booking` exige o nascimento | `deno check` (não executado; não há Deno na máquina), casos (a) e (b) em homologação, decisão C5 e publicação. Tratar também 561 e 562 (oráculos de identificação) |
| 004 | Exclusão LGPD destrutiva | **contido no código local** (E2) e **correção definitiva escrita** (E1) | `src/lib/lgpdCompliance.ts:136` desliga a exclusão (`EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA = false`) e `:200` bloqueia antes de tocar no banco; nenhum `.tsx` fora de testes chama `deletePatientData` (grep do diretor). A RPC `lgpd_anonimizar_paciente` está em `supabase/migrations/20261028100000_lgpd_anonimizacao_transacional.sql` | Publicar a contenção. A RPC nunca rodou em Postgres, redige `audit_log` (`:255`) e não tem aprovação dupla. Falta o parecer do DPO **[AE]** |
| 005 | Backup no mesmo host | **aberto** | `scripts/ops/backup-offsite.sh` (passou em `bash -n` e ShellCheck) e `docs/operations/backup-e-restauracao.md` | Decisões D1 a D4, instalação autorizada na VPS e primeiro `restore-drill` com RTO medido. Até lá o RPO real é de 24 h, se houver dump, e o RTO é desconhecido |
| 545 (novo) | Prontuário mostra um paciente e grava outro | **P0 suspeito** | `src/pages/Prontuarios.tsx:925-927` grava `paciente_id` em `currentProntuario` ao abrir o diálogo; `:946-950` troca `selectedPacienteId` quando a rota muda, sem fechar o diálogo nem conferir; `:1271` grava com `currentProntuario.paciente_id`. A faixa lê `selectedPaciente` (`:878`). Conferido pelo diretor (E1). Não se sabe se o caminho é alcançável na UI | Teste que abre a evolução de A, navega pela Fila para B com o diálogo aberto e confere o que foi gravado. Se reproduzir, corrigir: fechar o diálogo ou bloquear a troca com alterações pendentes, e conferir os dois IDs antes de gravar |

**CLIN-QA-512, rebaixado para P1 pelo diretor.** No portal, o CPF do titular vem do token, no servidor (`supabase/functions/patient-portal/index.ts:132`, `:166`). A busca filtra pela clínica (`:948`) e o dependente pedido precisa estar na lista (`:133`). Não há acesso entre clínicas nem CPF digitado pelo usuário. O risco que sobra vem do cadastro: um `cpf_responsavel` digitado errado, ou que não foi limpo quando o dependente fez 18 anos, dá a um terceiro acesso ao portal do dependente, incluindo resultados. Proposta: confirmar o vínculo na recepção, guardar `responsavel_paciente_id` em vez do CPF e expirar o vínculo na maioridade **[AE]**.

## 3. Veredito por entrega

Legenda: **pronto** = a entrega cumpre a tarefa e tem evidência suficiente para o estado que declara; **pronto com ressalva** = entrega válida, com condição explícita antes do próximo passo; **não pronto** = não cumpre a tarefa ou não pode ser usada como está. "Pronto" vale para o artefato e nunca significa que o P0 relacionado fechou.

| Agente | Entrega | Veredito | Motivo e condição |
|---|---|---|---|
| database-engineer | Migration de revogação de anon (001) | **Pronto com ressalva** | É a melhor entrega da rodada: transação única, allowlist por OID, privilégios padrão, verificação que aborta e reversão documentada. Teste PGlite 30 de 30 (E2, não reexecutado pelo diretor; o script está no apêndice do resumo). Ressalvas: a allowlist precisa ser confirmada pela consulta C1; policies `TO public` que chamam helpers revogadas podem quebrar páginas anônimas; a regra "sem JWT é chamada interna" depende de o PostgREST da VPS preencher `request.jwt.claims` (auditoria de segurança, seção 4.5). Não aplicar antes de C1 |
| backend-developer | RPC `lgpd_anonimizar_paciente` e cliente (004) | **Não pronto** para uso; pronto como rascunho para revisão | O cliente passou em 17 de 17 testes (o diretor reexecutou junto com os demais: 32 de 32). A função SQL nunca rodou em Postgres, e o teste da migration só confere o texto. Ela redige valores antigos de `audit_log` (`20261028100000_lgpd_anonimizacao_transacional.sql:255`), o que conflita com a trilha de auditoria do prontuário **[AE]**. Não tem a aprovação dupla prevista pelo tech-lead. Antes do aceite: teste em PGlite no padrão do database-engineer, com falha simulada no meio, e parecer do DPO |
| tech-lead | Contenção 7.3 (LGPD) e 7.4 (WhatsApp e agendamento público) | **Pronto com ressalva** | `tsc` passou com 0 erros; os testes unitários passaram (19 de 19, reexecutados pelo diretor dentro dos 32 de 32); Playwright do agendamento 8 de 8, com 6 retentativas atribuídas à carga da máquina. Ressalvas: `deno check` não executado; nada testado contra banco; conversas herdadas (C5) sem decisão; tarefas de pendência e de LGPD visíveis a todos os papéis, com o motivo informado pelo paciente (P2); `checarRateLimit` deixa passar quando o banco falha, o que enfraquece o limite de 3 tentativas (P2, CLIN-QA-027) |
| devops-sre | Backup off-site, PITR e CI com banco efêmero (005, 002) | **Pronto com ressalva** | O script passou em `bash -n` e ShellCheck sem avisos, e tem travas contra rodar o ensaio na produção. Nunca rodou contra um Postgres. Sem `.gitattributes`, o `.sh` pode sair com CRLF no Windows. O P0 005 continua aberto até o primeiro ensaio |
| qa-engineer | Plano de regressão e causa do skip no CI (002) | **Pronto** | Causa do skip reproduzida (`41 skipped`, saída 0), com `caminho:linha`. São 56 casos ligados às histórias do PO. Achados 563 a 566 bem fundamentados. Nenhum caso de integração foi executado, como o próprio plano declara |
| security-engineer | Consultas só leitura e auditoria dos P0 de acesso | **Pronto com ressalva** | O SQL foi verificado como só leitura (11 blocos `READ ONLY`, nenhuma instrução de escrita), mas nunca executado. A lista de migrations embutida é um retrato de 27/10 e precisa ser gerada de novo antes de rodar. O MFA no servidor (007) segue sem correção escrita |
| software-architect | ADRs 0001, 0002 e 0003 | **Pronto com ressalva** | As decisões estão coerentes com o diagnóstico e entre si, e as flags da CLI foram conferidas na documentação oficial. Falta aprovação do responsável. A ADR 0001 tem risco P0 na reescrita de `is_same_clinica` e só pode começar depois do gate S2 |
| product-manager | Segmentos e roadmap | **Pronto com ressalva** | Baseline de 5 concorrentes conferido em sites oficiais em 27/10. O RICE usa estimativas sem dado de uso. O preço do Simples Dental diverge do diagnóstico e precisa de nova conferência antes de material comercial. Decisões D-01 a D-05 pendentes |
| product-owner | 34 histórias (501 a 534) e fila ordenada | **Pronto com ressalva** | Todas as histórias trazem os critérios de outra clínica e de permissão negada, e os links foram conferidos por script. Nenhuma história está aceita. A faixa de IDs gerou conflito (seção 4, item 1) |
| ux-researcher | Plano de pesquisa e heurística de paciente errado | **Pronto com ressalva** | Os achados têm `caminho:linha`, e o diretor confirmou o 545. Tudo é hipótese de efeito no usuário até haver teste. A pesquisa depende de homologação, que ainda não existe. Os IDs precisam ser renumerados (seção 4, item 1) |
| sales-customer-success | Demo, objeções, implantação e saúde do cliente | **Pronto com ressalva** | O que pode e o que não pode ser mostrado está conferido no código. A tabela de ensaio está toda em NÃO EXECUTADO, então não usar com cliente antes do smoke S5. Corrige o diagnóstico em um ponto: check-in e cobrança não são atômicos (`src/lib/checkinWithBilling.ts:11-14`) |
| frontend-developer, product-designer, business-analyst, especialista-dominio-saude, growth-marketing | Leva 2 | **Não avaliado** | Sem resumo até o fechamento deste documento. Há artefatos parciais em disco, por exemplo `src/components/clinical/IdentificacaoPaciente.tsx`, `docs/produto/processos/identificacao-paciente-canais-publicos.md` e dois arquivos em `docs/gtm/`. Serão avaliados na atualização |

## 4. Conflitos entre agentes e decisões do diretor

| # | Conflito | Agentes | Decisão |
|---|---|---|---|
| 1 | **Faixa de IDs.** O PO reservou 501 a 549 em `docs/produto/backlog/README.md`, mas o ux-researcher usou 541 a 548 dentro dessa faixa. O qa-engineer usou 561 a 566, fora dela | PO, UX, QA | Não há colisão de arquivo hoje, porque o PO parou no 534. Mesmo assim, para evitar colisão futura, os itens de UX passam a **CLIN-QA-551 a 558**, com a mesma ordem (541 vira 551, e assim por diante). O PO mantém 501 a 549 e o QA mantém 561 a 569. Para a rodada 2 vale este registro de faixas: PO 501 a 549, UX 551 a 559, QA 561 a 569, segurança 571 a 579, SRE 581 a 589, demais agentes 591 a 599. Neste documento, "545" se refere ao achado de UX, que passa a ser o 555 |
| 2 | **`search_path` das funções `SECURITY DEFINER`.** O database-engineer usa string vazia com nomes qualificados; o backend-developer usa `public, pg_temp` | DB, backend | Padrão: string vazia com nomes qualificados (`GATES.md` 1.4). A RPC LGPD deve ser ajustada antes da aplicação (P3) |
| 3 | **Onde registrar o pedido de exclusão LGPD.** O tech-lead grava em `tarefas`, visíveis a todos os papéis; a RPC do backend grava em `lgpd_deletion_log`; o tech-lead propõe aceitar `deletion` em `lgpd_access_request_log` | tech-lead, backend | Um registro só, em tabela LGPD com acesso restrito ao administrador e ao encarregado. A tarefa fica sem dado pessoal e sem o motivo informado pelo paciente. Dono: database-engineer, com parecer do DPO |
| 4 | **Escopo da anonimização.** O backend redige valores antigos de `audit_log` e não tem aprovação dupla; o tech-lead e o diagnóstico (30.5) pedem preservação do prontuário e aprovação dupla | backend, tech-lead | A RPC não entra na fila de aplicação até o parecer do DPO definir o que pode ser redigido na trilha de auditoria **[AE]**. A aprovação dupla fica como critério de aceite da história do PO |
| 5 | **Funções de cron abertas para `authenticated`.** A migration 001 preserva o acesso efetivo de `authenticated` de propósito; a segurança aponta isso como risco | DB, segurança | A migration 001 não muda de escopo, porque o objetivo dela é anon. Abrir item P1 de segurança (faixa 571) para revisar as funções de cron e as funções internas executáveis por qualquer usuário logado |
| 6 | **Check-in "atômico".** O diagnóstico usa o termo, mas o código diz que check-in e cobrança são operações separadas (`src/lib/checkinWithBilling.ts:11-14`) | sales, diagnóstico | Vale o código. Errata no diagnóstico e na comunicação comercial. Revisar se a separação deixa a cobrança sem check-in, ou o contrário, numa falha (QA, smoke S5) |
| 7 | **Plano Ultra vende IA no WhatsApp** com 003 e 009 abertos | PM, sales | Até o 003 fechar e o 009 ter aceite de risco, o agente de IA no WhatsApp não é ligado em clínica nova nem demonstrado (`GATES.md` B3). Decisão D-05 do responsável |
| 8 | **Prefixo de migration duplicado `20261010198000`.** Cinco agentes acharam, nenhum é dono | DB, QA, SRE, segurança, arquiteto | Dono: database-engineer (CLIN-QA-563), dentro da ADR 0002. Não renomear migration já aplicada em produção sem antes ler a tabela de migrations da VPS (C1) |
| 9 | **Verificação completa da rodada.** O tech-lead rodou `npm run test:run` (1131 de 1132) e `npm run lint` (1 erro) antes do aviso de memória, e o backend corrigiu um erro de `tsc` sem rodar de novo | tech-lead, backend, QA | A verificação única de fim de rodada (`tsc`, `vitest` e lint) continua pendente e é do qa-engineer. A falha em `src/pages/__tests__/portalPacienteCancelamento.test.tsx` e o erro `no-control-regex` em `src/components/agenda/AppointmentDialog.tsx:36` são da outra frente, mas bloqueiam o merge da branch |
| 10 | **Citação de linha desatualizada.** O relatório 02 cita o token do WhatsApp em `:38`; no worktree atual ele está em `:45` | arquiteto | Corrigir a referência no backlog do PO quando a história do 009 for revisada |

## 5. Novos itens levantados na rodada

| ID | Gravidade | Título | Evidência | Dono |
|---|---|---|---|---|
| 545 (vira 555) | **P0 suspeito** | Prontuário mostra um paciente e grava outro | `src/pages/Prontuarios.tsx:878`, `:925-927`, `:946-950`, `:1271` | qa-engineer (teste), depois frontend-developer |
| 512 | P1 (rebaixado) | Vínculo de dependente no portal só por `cpf_responsavel` | `supabase/functions/patient-portal/index.ts:132-133`, `:940-952` | security-engineer, DPO **[AE]** |
| 507 | P1 | Conversas de WhatsApp com vínculo herdado do telefone | Resumo do tech-lead, seção Riscos | Responsável (C5) |
| 563 | P1 (hipótese) | Prefixo de migration duplicado deve quebrar o `db reset` | `ls supabase/migrations`, repetido por 5 agentes | database-engineer |
| 564 | P1 (hipótese forte) | O modo de teste do Vite fixa uma chave sintética e impede o login real no E2E | `vite.config.ts:152` (qa-engineer) | tech-lead |
| 565 | P1 | As asserções de isolamento passam com banco vazio | `tests/isolamento-entre-clinicas.spec.ts:114` (`.filter(Boolean)`) | qa-engineer |
| 566 | P2 | Sem seed de duas clínicas e sem configuração local do Supabase | qa-engineer | qa-engineer |
| SEC-R1-06 | P2 | O hash guardado do token do portal também funciona como token, pelo fallback legado | `supabase/functions/patient-portal/index.ts:83-104` (security-engineer) | backend-developer |
| 541 a 548 (viram 551 a 558) | P1 e P2 | Identificação do paciente em Recepção, Prontuário e Caixa, incluindo "Confirmar Pagamento" sem o nome do paciente (`src/pages/Recepcao.tsx:1535`) | `docs/ux/pesquisa/plano-rodada-1.md` | product-designer, frontend-developer |
| 561, 562 | P3 | Pequenos oráculos de identificação no WhatsApp e no agendamento | qa-engineer | backend-developer |

## 6. Conferência por amostragem feita pelo diretor

Todos os comandos rodaram na raiz do repositório em 27/10/2026, só com leitura, exceto o vitest, que roda testes já existentes.

| Verificação | Comando | Resultado |
|---|---|---|
| Testes unitários das contenções e da RPC LGPD | `npx vitest run src/lib/__tests__/identificacaoPaciente.test.ts src/lib/__tests__/lgpdExclusaoBloqueada.test.ts src/lib/__tests__/lgpdAnonimizacao.test.ts` | 3 arquivos, **32 de 32 passaram** |
| Vínculo por telefone removido no WhatsApp | `grep -n "ilike" supabase/functions/whatsapp-webhook/index.ts` | O único `ilike` restante é o filtro de especialidade (`:830`). A conversa nasce com `paciente_id: null` (`:189`) |
| Exclusão LGPD inalcançável pela UI | `grep -rn deletePatientData src --include=*.tsx`, fora de `__tests__` | Nenhuma ocorrência |
| Trava da exclusão | `grep -n EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA src/lib/lgpdCompliance.ts` | `:136` (`false`) e `:200` (checagem) |
| Grants da RPC LGPD | `grep -n "REVOKE\|GRANT\|search_path" supabase/migrations/20261028100000_*.sql` | `:95` `public, pg_temp`; `:316` `REVOKE ... FROM PUBLIC, anon`; `:317` `GRANT ... TO authenticated` |
| Migration 001 | Leitura completa de `supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql` | O conteúdo bate com o resumo do database-engineer |
| CLIN-QA-545 | `sed -n` em `src/pages/Prontuarios.tsx` (866-880, 922-952, 1266-1274) | Os dois estados de paciente são independentes e o diálogo não fecha quando a rota muda. Alcançável na UI: NÃO VERIFICADO |
| CLIN-QA-512 | `sed -n 925,960p` e `grep -n dependentesDoTitular` em `supabase/functions/patient-portal/index.ts` | CPF do titular vem do servidor e o filtro é por clínica, por isso o item foi rebaixado para P1 |
| Colisão de IDs | `ls docs/produto/backlog` e `grep -rhoE "CLIN-QA-5[4-6][0-9]" docs/ux docs/qa ...` | O PO vai até o 534; UX usa 541 a 548; QA usa 561 a 566 |

Não reexecutado pelo diretor: o teste PGlite de 30 casos (depende de pacote fora do repositório), o ShellCheck, o Playwright e o `tsc`.

## 7. Próximos passos (rodada 2)

Ordem de prioridade, com dono e critério de pronto:

1. **Responsável:**
   - rodar `docs/seguranca/consultas-vps-somente-leitura.sql` na VPS e anexar a saída (C1). Isso destrava a aplicação do 001 e o diagnóstico do drift;
   - decidir C5 (conversas herdadas), D1 a D4 do backup e D-05 (IA no plano Ultra);
   - pedir o parecer do DPO sobre a anonimização e sobre a redação de `audit_log`.
2. **Tech-lead:** separar o trabalho dos P0 da outra frente, com um commit ou PR por item (001, 003 e 004, e LGPD RPC à parte). Pronto quando cada PR tiver só os arquivos do item e o diff revisável.
3. **qa-engineer:**
   - verificação completa única (`tsc`, `vitest`, lint);
   - teste do 555 (antigo 545);
   - com autorização para editar `tests/` e `scripts/qa/`: seed de duas clínicas, `falhar-se-pulado` e a correção das asserções (565).
4. **database-engineer:**
   - ressalvas da seção 4.5 da auditoria na migration 001;
   - prefixo duplicado (563);
   - teste PGlite da RPC LGPD com falha simulada;
   - registro único do pedido LGPD (conflito 3).
5. **devops-sre:** com autorização para editar `.github/`, job `security-e2e` primeiro em modo informativo, `.gitattributes` com `*.sh text eol=lf` e o comentário falso de `test.yml:93-97`. Depois das decisões D1 a D4: instalação do backup e primeiro `restore-drill`.
6. **security-engineer:** reclassificar 001 com a saída de C1; revisar as rotas públicas do 003 (oráculos 561 e 562); corrigir o MFA no servidor (007); revisar as funções executáveis por qualquer usuário logado (conflito 5); remover o fallback do portal (SEC-R1-06).
7. **Leva 2:** entregar os cinco resumos. O diretor atualiza este consolidado e dá o veredito do componente `IdentificacaoPaciente` contra a especificação do product-designer.

## 8. O que este consolidado não fez

- Não executou nada contra banco, VPS, staging ou produção, e não aplicou nenhuma migration.
- Não reexecutou o teste PGlite, o ShellCheck, o Playwright nem o `tsc`.
- Não avaliou os artefatos da leva 2, porque os resumos ainda não chegaram.
- Não abriu nem testou a UI no navegador. As observações de UX são leitura de código.
- Não editou código nem nenhum outro arquivo além de `docs/time/GATES.md` e deste documento.
