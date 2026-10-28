# Rodada 3: codex-revisor

## Escopo

Revisão independente de correção das mudanças descritas nos resumos das rodadas 1 e 2, com foco em paciente errado, isolamento entre clínicas, perda de dados e transações. Não editei código. O repositório está compartilhado com agentes paralelos; os achados descrevem o snapshot lido durante esta revisão.

## Achados

### CR-03-01 — P0 — Dependente acessível por CPF de responsável não confirmado

- **Arquivo/linhas:** `supabase/functions/patient-portal/acessoPortal.ts:90-135`; `supabase/functions/patient-portal/index.ts:100-125, 141-143`.
- **Cenário:** alguém informa CPF de terceiro como responsável em um agendamento público e controla os contatos informados. Depois de obter acesso ao portal associado ao cadastro, o servidor lista pacientes da clínica cujo `cpf_responsavel` corresponde ao CPF do titular (`acessoPortal.ts:123-135`). Ser menor e ter CPF diferente do titular não prova o vínculo. O chamador pode selecionar esse dependente e as ações do portal passam a usar seu `pacienteId` (`index.ts:106-125`). Isso permite acesso a dados de outro paciente e, conforme ação, alteração de contato ou agendamento.
- **Classificação:** P0 por exposição de dados de paciente. O filtro de clínica reduz o alcance entre tenants, mas não impede a tomada de vínculo dentro da clínica.
- **Evidência:** leitura direta do código atual. Confirma o risco já descrito em `docs/seguranca/auditoria-rodada-2.md:44-74` e em `docs/time/rodada-2/tech-lead-final.md` (TL-R2-01). A checagem de idade é uma mitigação parcial, não uma confirmação de vínculo.
- **Ação:** manter `get_dependentes` e `dependente_id` indisponíveis até existir vínculo explícito, confirmado e autorizado no servidor; depois cobrir vínculo legítimo e tentativa com CPF informado por terceiro em teste de duas clínicas.

### CR-03-02 — P2 — Atualização parcial de contato pode apagar o outro canal

- **Arquivo/linhas:** `supabase/functions/patient-portal/index.ts:282-298`.
- **Cenário:** cliente envia apenas telefone (ou apenas e-mail) em `update_contact`; o servidor converte o campo omitido em string vazia e grava `null` (`:283-294`), apagando o contato existente. Com `dependente_id`, essa operação também alcança o cadastro do dependente.
- **Classificação:** P2, perda recuperável de dado de contato, com contorno por novo preenchimento.
- **Evidência:** leitura direta do código atual; o efeito para atualização parcial também consta como TL-R2-02 em `docs/time/rodada-2/tech-lead-final.md`.
- **Ação:** definir semântica explícita de atualização parcial: preservar campo omitido ou exigir e validar ambos os campos; teste deve garantir que atualizar telefone não apaga e-mail.

### CR-03-03 — P2 — Dados pessoais de pedido ambíguo gravados em tarefa ampla

- **Arquivo/linhas:** `supabase/functions/public-booking/index.ts:193-218`.
- **Cenário:** divergência ou ambiguidade de cadastro cria tarefa sem `paciente_id`, mas inclui nome, CPF parcialmente mascarado, nascimento, telefone e e-mail em `descricao` (`:195-216`). A tarefa não está ligada ao cadastro do paciente; usuários com acesso comum às tarefas da clínica podem consultá-la, e o fluxo de anonimização por paciente não consegue localizar essa cópia automaticamente.
- **Classificação:** P2, exposição desnecessária de dados pessoais e dificuldade de atender correção/anonimização.
- **Evidência:** leitura direta do código atual. O risco de cópias em tarefas também foi registrado como achado 574 em `docs/seguranca/auditoria-rodada-2.md:151-165`.
- **Ação:** manter dados do titular em registro restrito com retenção definida e referenciado por ID; a tarefa operacional deve conter apenas o mínimo necessário.

## Revisão de controles relacionados

- **CLIN-QA-555:** a guarda de gravação em `src/pages/Prontuarios.tsx:1204-1210` bloqueia divergência entre o paciente do registro e o selecionado; solicitação de exame também compara os IDs e grava o ID do registro (`:1546-1563`). O diálogo usa o paciente do registro (`:882-886`, `:2096-2120`). Não reproduzi a corrida H1 em navegador; portanto, correção funcional em execução permanece **NÃO VERIFICADA** e depende do teste de tela solicitado ao QA.
- **CLIN-QA-003:** o resumo da rodada 1 documenta que conversa nasce sem vínculo e o vínculo posterior usa CPF + nascimento. Esta revisão não executou Edge Functions nem revalidou o fluxo contra Supabase; comportamento de runtime **NÃO VERIFICADO**.
- **CLIN-QA-004:** `src/lib/lgpdCompliance.ts:165-190` mantém a anonimização desabilitada por padrão e recusa antes da RPC; a exclusão destrutiva também permanece bloqueada. Isso reduz risco de escrita prematura. Não executei Postgres/PGlite nesta revisão.

## Evidências executadas

- Leitura de `docs/time/REGRAS_DO_TIME.md`, `docs/time/GATES.md`, resumos das rodadas 1 e 2, consolidado e auditoria de segurança da rodada 2.
- `git diff -- <arquivos centrais>`: confirmou mudanças locais em `patient-portal`, `public-booking`, `whatsapp-webhook`, `lgpdCompliance.ts` e `Prontuarios.tsx`; saída indicou alterações nos arquivos centrais, sem editar esses arquivos.
- `rg -n` nos arquivos centrais e leitura numerada dos trechos acima: confirmou as linhas dos achados.
- Não rodei testes: esta tarefa é revisão estática, e nenhum código foi alterado.

## Pendências e próximo dono

- **backend-developer:** conter CR-03-01 até existir vínculo explícito confirmado; revisar a semântica de `update_contact` (CR-03-02).
- **database-engineer / backend-developer:** propor armazenamento restrito e retenção para dados de pedidos ambíguos (CR-03-03), alinhado ao registro do achado 574.
- **qa-engineer:** executar o teste de aceite de H1 do CLIN-QA-555 e casos negativos de dependente sem vínculo confirmado.
- **Responsável:** decidir apenas questões que dependam de política de acesso/retensão; sem dependência de decisão para a contenção técnica do P0.

