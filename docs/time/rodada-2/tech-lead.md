# Rodada 2: tech-lead

Data: 27/10/2026. Sem deploy, sem migration aplicada, sem commit e sem acesso à VPS.

## 1. Integração da anonimização transacional (CLIN-QA-004)

### O que fiz
- Em `src/lib/lgpdCompliance.ts`:
  - nova trava `ANONIMIZACAO_LGPD_HABILITADA = false` (`:165`), separada da `EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA`, que continua `false` e intocada;
  - `AnonimizacaoLgpdIndisponivelError` (`:167`);
  - `anonimizarPacienteLgpd` (`:180`), o único ponto de entrada da tela. Com a trava desligada, ela recusa antes de chamar o banco. Com a trava ligada, delega para `anonimizarPaciente` (`src/lib/lgpdAnonimizacao.ts`, do backend-developer), que chama só a RPC `lgpd_anonimizar_paciente`. Não há `delete` por tabela.
- Novo componente `src/components/lgpd/AnonimizarPacienteDialog.tsx` (181 linhas):
  - mostra o nome do paciente no cabeçalho do diálogo;
  - exige um motivo de pelo menos 10 caracteres e o nome completo digitado para confirmar;
  - mostra o resultado e as pendências manuais (foto e WhatsApp);
  - erros: as mensagens de `AnonimizacaoLgpdError` já vêm traduzidas; os demais erros passam por `mensagemDeErro` (`src/lib/erros.ts`);
  - o estado é limpo a cada abertura ou troca de paciente, para não reaproveitar a confirmação de outro paciente.
- Tela `src/pages/LgpdPacientes.tsx` (rota `/lgpd-pacientes`, já restrita a `admin` em `src/App.tsx:348`):
  - o botão "Anonimizar" (`:195`) e o diálogo (`:264`) só existem com a trava ligada;
  - com a trava desligada, como hoje, a tela continua só exportando e registrando o pedido para tratamento manual;
  - removi o import morto `Download`.

### Por que a trava fica desligada
A anonimização ainda não pode ir para o usuário, pelos seguintes motivos:
- A migration `20261028100000` não foi aplicada e nunca rodou em Postgres.
- Falta o parecer do DPO sobre a redação de `audit_log` **[requer avaliação especializada]**.
- Faltam a aprovação dupla (conflito 4 do consolidado da rodada 1) e a exigência de MFA (`aal2`, CLIN-QA-579 da segurança).
- O `search_path` está fora do padrão.

Ligar a trava exige pedido do responsável depois desses quatro itens.

### Arquivos tocados
- `src/lib/lgpdCompliance.ts` (editado)
- `src/pages/LgpdPacientes.tsx` (editado)
- `src/components/lgpd/AnonimizarPacienteDialog.tsx` (novo)
- `src/components/lgpd/__tests__/AnonimizarPacienteDialog.test.tsx` (novo)
- `src/lib/__tests__/lgpdAnonimizacaoIntegracao.test.ts` (novo)
- `src/pages/__tests__/LgpdPacientes.test.tsx` (novo)
- `docs/time/rodada-2/tech-lead.md` (este arquivo)

### Evidências
| Comando | Resultado |
|---|---|
| `npx vitest run src/lib/__tests__/lgpdAnonimizacaoIntegracao.test.ts src/components/lgpd/__tests__/AnonimizarPacienteDialog.test.tsx src/pages/__tests__/LgpdPacientes.test.tsx src/lib/__tests__/lgpdExclusaoBloqueada.test.ts src/lib/__tests__/lgpdAnonimizacao.test.ts` | 5 arquivos, **29 de 29 passaram** (inclui os 2 arquivos anteriores, sem regressão) |
| `npx eslint` nos arquivos tocados | 0 erros. Há 27 avisos `no-explicit-any`, todos em linhas que já existiam; nenhum `any` novo |

O que os testes cobrem:
- As duas travas estão desligadas.
- Com a trava desligada, a anonimização recusa sem chamar `rpc` nem `from`.
- Com a trava ligada, faz uma única chamada a `lgpd_anonimizar_paciente`, com os quatro parâmetros, e nenhum `from`.
- Diálogo:
  - mostra o paciente e só libera o envio com motivo e confirmação;
  - envia paciente, clínica, motivo e confirmação, e mostra as pendências;
  - mostra o erro traduzido e não chama `onConcluido`.
- Tela: com a trava desligada não há botão "Anonimizar"; com a trava ligada, há.

Não foram executados nesta tarefa, por regra da rodada: `tsc` e `vitest` completos. Eles ficam para a verificação final (`TAREFAS-C.json`).

## 2. Revisão dos diffs da rodada 2

Entregas que já tinham resumo quando revisei: backend-developer, devops-sre, security-engineer e database-engineer. As do qa-engineer, do frontend-developer e do product-owner **não foram revisadas**. O `tests/` estava sendo alterado durante a revisão, e os resumos dessas entregas ainda não existiam.

Reexecutei:
- `npx -y deno@2 test --no-lock --config=supabase/functions/deno.json supabase/functions/patient-portal/` → `ok | 38 passed | 0 failed`;
- `node --test scripts/ci/falhar-se-pulado.test.mjs` → `tests 9, pass 9, fail 0`.

Não reexecutei: PGlite (63 casos), actionlint e o `deno check`.

### Achados

| # | Gravidade | Onde | Achado | Dono |
|---|---|---|---|---|
| TL-R2-01 | **P0** | `supabase/functions/patient-portal/index.ts:104-126`, `:142`, `:282-298`; `acessoPortal.ts:100-135` | **CLIN-QA-512 continua aberto.** O backend descreve o item como "mitigado", mas a mitigação (só menores e CPF diferente do titular) não fecha a cadeia confirmada pela segurança: CPF do responsável digitado no agendamento público, depois `solicitar_acesso`, depois o titular falso lê o menor. Confirmei por leitura que `update_contact` (`:282-298`) grava no `pacienteId` do dependente, então o titular falso também troca o contato do menor. Fato novo: **toda a funcionalidade de dependentes não existe no `HEAD`** (`git show HEAD:supabase/functions/patient-portal/index.ts \| grep -c dependente` → `0`). Ela vem das alterações locais da outra frente. Contenção mais barata: **não publicar** `get_dependentes` nem `dependente_id` até existir o vínculo explícito confirmado na recepção. Se essa versão já estiver publicada na VPS (NÃO VERIFICADO), desligar o ramo. | backend-developer; responsável confirma o que está publicado |
| TL-R2-02 | P2 | `patient-portal/index.ts:291-293` | `update_contact` grava `telefone \|\| null` e `email \|\| null`. Um cliente que mande só o telefone apaga o e-mail do cadastro. Já existia no `HEAD` (`:143`), mas agora também alcança o dependente | backend-developer |
| TL-R2-03 | P2 | `acessoPortal.ts:131` | `.in('cpf_responsavel', [d, formatado])` só casa dois formatos. Isso falha fechado, o que é seguro, mas o dependente legítimo some sem aviso. Já registrado pelo backend (pendência 4) | database-engineer (`cpf_responsavel_digitos`) |
| TL-R2-04 | P3 | `acessoPortal.ts:50-62` | SEC-R1-06 está correto: uma consulta só, pelo hash; o formato é validado antes; `maybeSingle` responde 401 sem distinguir os casos. Ressalva: tokens em texto puro anteriores a `20260817310000` deixam de valer. A falha é segura (401), mas depende da consulta 6.1 na VPS antes do deploy | responsável (consulta 6.1) |
| TL-R2-05 | P1 | `.github/workflows/test.yml`, job `security-e2e`, passo "Versões de migration únicas" | O job falha de propósito no primeiro passo enquanto existir `20261010198000` duplicado. Correto como trava, mas **não torne o job obrigatório na proteção de `main`** antes do renome descrito em `docs/arquitetura/banco/versoes-duplicadas.md`, ou o merge fica bloqueado | devops-sre, database-engineer |
| TL-R2-06 | P1 | `vite.config.ts:152` (`createViteTestSupabaseDefine({})`) e `playwright.config.ts:44` (`--mode test`) | CLIN-QA-564 continua: o `webServer` sobe o Vite em modo de teste com chave fixa, e o job `security-e2e` não define `VITE_SUPABASE_*`. Os testes de RBAC pela UI devem falhar no job. O devops atribuiu o item a mim, mas ele não estava na minha tarefa desta rodada | tech-lead, na próxima rodada |
| TL-R2-07 | P2 | `test.yml`, passo "Seed sintético de duas clínicas" | O contrato entre o seed (`tests/fixtures/seed-duas-clinicas.ts`, que escreve no `GITHUB_ENV`) e as 18 `QA_*` conferidas em `scripts/ci/security-e2e-conferir-env.sh` ainda não foi confirmado pelo qa-engineer. O Node 24 executa `.ts` só sem sintaxe exclusiva de TS e sem alias `@/`. Nunca rodou no Actions | qa-engineer, devops-sre |
| TL-R2-08 | P2 | `supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql:410-433` | O privilégio padrão continua concedendo `EXECUTE` de funções futuras a `authenticated`. Função nova de cron que esquecer o `REVOKE` volta a ser executável por qualquer usuário logado. Proposta: uma checagem no CI (lista de `cron.schedule` comparada com o passo 2b) | database-engineer, devops-sre |
| TL-R2-09 | P3 | mesma migration, `:393-394` | A busca do papel do job usa `command ILIKE '%proname%'`. O `_` funciona como curinga e o padrão também casa nomes com sufixo. O pior caso é um `GRANT` a mais para o papel do job, nunca para anon ou authenticated | database-engineer |
| TL-R2-10 | P3 | mesma migration | O arquivo tem 557 linhas, acima da referência de 400. É aceitável por ser uma transação única com verificações, mas convém dividir as verificações 4a a 4c em um teste separado quando houver pgTAP | database-engineer |
| TL-R2-11 | P3 | `src/lib/lgpdCompliance.ts:180-183` (autocrítica) | `anonimizarPacienteLgpd` aceita `habilitada` como parâmetro, como ponto de teste. Um chamador poderia passar `true` e contornar a trava. Hoje o risco é nulo, porque a RPC não existe no banco e o único chamador (`AnonimizarPacienteDialog`) não passa o parâmetro. Ao ligar de fato, remover o parâmetro e testar com `vi.mock` do módulo | tech-lead |

### Pontos aprovados na revisão
- **R3 do database-engineer (`20261028090000...sql:106-123`).** Ler `current_setting('role')` além do JWT está correto: `SECURITY DEFINER` troca o `current_user`, mas não a GUC `role`. O pg_cron e o SQL interno (`none`) continuam passando. A premissa sobre como o PostgREST da VPS define o papel segue NÃO VERIFICADA, como ele mesmo registrou.
- **Passo 2b, funções de cron fora de anon e authenticated.** Os testes de mutação descritos detectam cada regressão (E2 declarado, não reexecutado por mim).
- **devops-sre.** O job `security-e2e` não herda secrets nem o projeto Cloud, tem trava de loopback e um gate de skip com allowlist vencível. O `supabase link` saiu do `static-checks`.

## 3. Pendências

| # | Pendência | Dono |
|---|---|---|
| 1 | Parecer do DPO sobre a redação de `audit_log` e o escopo da anonimização **[AE]** | responsável |
| 2 | Aprovação dupla e `aal2` na RPC, mais `search_path = ''` (CLIN-QA-579 e conflito 2 da rodada 1) | backend-developer, database-engineer |
| 3 | Teste PGlite da RPC LGPD com falha simulada no meio | database-engineer |
| 4 | Ligar `ANONIMIZACAO_LGPD_HABILITADA` só depois de 1 a 3 e da aplicação aprovada | responsável |
| 5 | Confirmar se a versão do portal com dependentes já está publicada na VPS (TL-R2-01) | responsável |
| 6 | CLIN-QA-564, o modo de teste do Vite (TL-R2-06) | tech-lead |
| 7 | Revisar as entregas do qa-engineer, do frontend-developer e do product-owner quando terminarem. Fica para a verificação final da rodada | tech-lead (`TAREFAS-C`) |
| 8 | Separar os commits por P0 (item 2 do consolidado da rodada 1). Depende de pedido de commit do responsável | tech-lead, com autorização |

## 4. Próximo dono
- **backend-developer:** TL-R2-01 (contenção de dependentes) e TL-R2-02.
- **database-engineer:** pendências 2 e 3, e TL-R2-08 e TL-R2-09.
- **qa-engineer:** TL-R2-07.
- **Responsável:** pendências 1, 4 e 5.
- **clinical-quality-director:** registrar no consolidado que o 512 volta a P0, em código ainda não versionado.
