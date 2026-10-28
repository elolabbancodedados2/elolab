# Revisão independente do porte — rodada 4

Data: 27/10/2026. Escopo: comparação da intenção documentada nas rodadas 1–3 com as alterações portadas para a base `3b5a738c`, usando os resumos da rodada 4 e o diff local. Revisão estática; não alterei código nem executei testes.

## Achados

### P2 — O gate de segurança do CI reprovará os skips do portal

- **Evidência:** `.github/workflows/test.yml:163-168` roda `falhar-se-pulado` sobre as três suítes e exige que não haja skips fora da allowlist. `tests/perfis-rbac.spec.ts:136` pula o teste de portal quando `QA_EDGE_STUB_CONFIRMED` não está configurado. O workflow documenta essa variável como configuração de fase futura (`.github/workflows/test.yml:82`), e `scripts/ci/security-e2e-skips-permitidos.json` não contém o título do teste de portal.
- **Impacto:** a primeira execução de `security-e2e` falhará no gate mesmo que as demais suítes passem. O resumo de `devops-sre` já identifica os dois testes do portal como não allowlisted; o `--exigir` não corrige essa incompatibilidade.
- **Ação sugerida:** antes de tornar o job obrigatório, habilitar o stub do portal no job ou registrar os skips com dono e validade na allowlist. Donos: devops-sre e qa-engineer.
- **Estado:** inferido estaticamente; o workflow não foi executado nesta revisão nem na rodada, conforme o resumo de devops-sre.

### P2 — Pedido ambíguo de agendamento grava dados pessoais em tarefa sem vínculo ao paciente

- **Evidência:** `supabase/functions/public-booking/index.ts:240-263` cria tarefa com `paciente_id: null` e inclui nome, CPF mascarado, nascimento, telefone e e-mail informados no formulário (`:249-255`). A tarefa é usada quando o CPF tem vínculo ambíguo (`:268-269`, `:286-287`).
- **Impacto:** dados identificáveis ficam copiados em texto livre, sem vínculo que permita localizar essa cópia pelo paciente para revisão/anonimização. A revisão de frontend da rodada 3 já registrou o risco de dados pessoais em tarefas e citou o achado 574 da auditoria (`docs/time/rodada-3/codex-revisor.md`, seção “Achados”). Não encontrei evidência de uma mudança de porte que o tenha eliminado.
- **Ação sugerida:** guardar os dados necessários à conferência em registro restrito, referenciado por ID; manter na tarefa apenas o mínimo operacional. Backend/database e segurança.

### P2 — A reserva do horário não é liberada quando o pedido vira pendência

- **Evidência:** a reserva é criada pela ação `hold` (`supabase/functions/public-booking/index.ts:178-190`), mas os dois caminhos de ambiguidade retornam de `registrarPendencia` diretamente (`:269`, `:287`) sem chamar a ação `release` (`:193-197`).
- **Impacto:** o horário fica indisponível até a expiração automática da reserva, embora nenhum agendamento tenha sido criado. O próprio resumo do backend-developer registra esta limitação na rodada 4.
- **Ação sugerida:** liberar a reserva após a criação bem-sucedida da tarefa; preservar a reserva se a criação da tarefa falhar para permitir uma resposta segura/repetição. Backend-developer.

## Conferência do porte e escopo

- **Paciente errado no prontuário (CLIN-QA-545):** a guarda de gravação compara o paciente do registro com o selecionado em `src/pages/Prontuarios.tsx:1272-1277`; exame usa `currentProntuario.paciente_id` após a mesma comparação (`:1592-1603`). No diálogo, PDF, WhatsApp, receita, alergias e anexos usam `pacienteDoDialogo` (`:2213-2295`, `:2539-2544`, `:2588`, `:2648-2649`). A lógica do rascunho da base nova foi preservada ao passar o objeto pelo pedido e pela confirmação de troca (`:937-978`, `:1472-1475`, `:1879`). Não encontrei regressão clara de vínculo nesses caminhos.
- **Identificação no WhatsApp (CLIN-QA-003):** conversa nova nasce sem `paciente_id` (`supabase/functions/whatsapp-webhook/index.ts:194-209`); a identificação valida CPF + nascimento, usa decisão compartilhada e atualiza somente se o campo ainda estiver nulo (`:1667-1701`). As ações de leitura/escrita de agendamentos recusam conversa não vinculada (`:1311`, `:1439-1445`, `:1479-1485`). A política compartilhada permite `identificar_paciente` para as capacidades de agenda em `supabase/functions/_shared/whatsappAgentPolicy.ts:67-75`. Não encontrei um caminho de vinculação só por telefone.
- **Agendamento público:** nascimento é obrigatório e normalizado (`supabase/functions/public-booking/index.ts:214-226`); só vincula CPF único com nascimento compatível e envia os demais casos à equipe (`:268-289`). O porte preserva hold/release e o limite contra pedidos online pendentes conforme registrado pelo backend.
- **Portal:** a busca de token continua hash-only, e a contenção de dependentes continua fechada (`supabase/functions/patient-portal/index.ts:84-130`, `:160-164`; `acessoPortal.ts:54-72`, `:145-177`). O paciente inativo segue recusado. Não encontrei regressão de isolamento no diff desse arquivo.
- **LGPD e telas:** a exclusão destrutiva segue bloqueada e a anonimização continua atrás da flag desligada (`src/lib/lgpdCompliance.ts:455-521`). O registro de solicitação não executa exclusão. A validação de nascimento do formulário coincide com o contrato do backend (`src/pages/AgendamentoOnline.tsx:203-213`, `:428-431`).
- **Suítes de segurança:** a cobertura acrescentada para pré-condições, escrita cruzada e portal aparece nos diffs de `tests/rls.spec.ts`, `tests/isolamento-entre-clinicas.spec.ts` e `tests/perfis-rbac.spec.ts`; os resumos registram que RLS/isolation/RBAC ainda não foram executados contra banco real. Portanto, a eficácia dessas asserções com o seed permanece **NÃO VERIFICADA**.
- `product-designer` não alterou código; a justificativa de que o FAQ já corresponde ao comportamento da base nova está documentada em `docs/time/rodada-4/product-designer.md`.

## Limites da revisão

Não executei `tsc`, testes, lint, Edge Functions ou banco local. Usei `git diff`, os resumos das rodadas e leitura dos caminhos de código citados. O sucesso de testes anotado pelos outros agentes é evidência dos respectivos resumos, não uma execução minha. Sem deploy, migration aplicada ou commit.

