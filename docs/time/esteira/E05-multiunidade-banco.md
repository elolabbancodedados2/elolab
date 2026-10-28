# E05 multiunidade-banco (database-engineer)

## O que foi feito
Fase 1 (expand) da ADR 0001, só local, sem aplicar:
- `supabase/migrations/20261029100000_multiunidade_fase1_expand.sql`: `organizacoes`, `clinicas.organizacao_id` (nullable), `membros_organizacao`, `membros_unidade (clinica_id, user_id, papel)`; RLS com policy por operação; índices (PK de `membros_unidade` começa por `clinica_id`; `(user_id) INCLUDE (...) WHERE ativo`); helpers novas `minhas_unidades`, `tem_papel`, `organizacoes_visiveis`, `gere_organizacao`, `gere_unidade` (`STABLE SECURITY DEFINER`, `search_path = ''`, `(SELECT auth.uid())`, revogadas de `PUBLIC`/`anon`); trigger que impede o dono de trocar `organizacao_id`; backfill idempotente a partir de `profiles × user_roles` (impersonação usa a clínica original, funcionário inativo entra inativo). Bloco de reversão no cabeçalho.
- Helpers existentes (`is_same_clinica`, `get_my_clinica_id`, `current_clinica_id`, `has_role`) e policies atuais **não foram tocadas**; a reescrita por dentro, com a mesma assinatura, é a fase 3.
- Teste: `docs/arquitetura/banco/testes/teste-multiunidade.mjs`.
- Notas: `docs/arquitetura/banco/multiunidade.md`.

## Comandos e resultados
- `node teste-multiunidade.mjs <migration>` (PGlite 0.3.15 instalado no scratchpad): 28 casos, todos passaram, exit 0. Cobre mesma clínica permitida, outra clínica negada (leitura, inserção, alteração, troca de organização), anon negado (tabelas e `tem_papel`), idempotência e `is_same_clinica` inalterada.
- Primeira execução teve 2 falhas do stub do teste (grant em `profiles` e `auth.uid()` com GUC vazio), corrigidas no setup; a migration não mudou.
- `grep -rl tem_papel supabase/ src/`: só a migration nova (sem colisão de nomes).
- tsc/vitest/eslint: não aplicáveis (nenhum arquivo TS tocado).

## Pendências (responsável)
- ADR 0001 ainda é proposta; aplicar só após aprovação e fase 0 (ADR 0002, CI com banco efêmero).
- Aplicação e gate pós-aplicação (consultas em `multiunidade.md`).
- Fase 2 (dupla escrita nas RPCs de convite/equipe/criação de clínica, `organizacao_id NOT NULL`, reconciliação).
- `NÃO VERIFICADO`: execução contra o schema real e `EXPLAIN` das helpers.
- A skill `supabase-postgres-best-practices` não está instalada nesta sessão; segui as práticas da ADR.

## Riscos
- Sem dupla escrita, usuários criados após a aplicação ficam sem vínculo até a fase 2 (sem impacto no app, nada lê as tabelas novas).

Próximo dono: `tech-lead` (fase 2) e `qa-engineer` (levar o teste ao CI com banco efêmero).
