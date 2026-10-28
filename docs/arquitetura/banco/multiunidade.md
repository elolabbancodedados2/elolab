# Multiunidade no banco: fase 1 (expand)

Referência: [ADR 0001](../adr/0001-multiunidade-organizacao-unidades-membros.md). A ADR ainda está como **proposta**; esta migration implementa só a fase 1 e não deve ser aplicada antes da aprovação da ADR e dos pré-requisitos da fase 0.

- Migration local: `supabase/migrations/20261029100000_multiunidade_fase1_expand.sql` (não aplicada).
- Teste: `docs/arquitetura/banco/testes/teste-multiunidade.mjs` (PGlite, dados sintéticos).

## O que muda

| Objeto | Tipo | Observação |
|---|---|---|
| `public.organizacoes` | tabela nova | `id, nome, cnpj_matriz, clinica_origem_id (UNIQUE), criado_por, created_at, updated_at` |
| `public.clinicas.organizacao_id` | coluna nova, nullable | FK `ON DELETE RESTRICT`; vira `NOT NULL` na fase 2 |
| `public.membros_organizacao` | tabela nova | PK `(organizacao_id, user_id)`; `papel_org` em `dono`/`gestor` |
| `public.membros_unidade` | tabela nova | PK `(clinica_id, user_id, papel)`; `papel` é `app_role`; `ativo` |
| `minhas_unidades()`, `tem_papel(uuid, app_role)`, `organizacoes_visiveis()`, `gere_organizacao(uuid)`, `gere_unidade(uuid)` | helpers novas | `sql STABLE SECURITY DEFINER SET search_path = ''`, `(SELECT auth.uid())`, `REVOKE ALL FROM PUBLIC, anon`, `GRANT` a `authenticated` e `service_role` |
| `clinicas_proteger_organizacao` | trigger | Impede o dono de trocar `organizacao_id` pela policy `clinicas_update` |

**Não muda:** `is_same_clinica`, `get_my_clinica_id`, `current_clinica_id`, `has_role`, `is_admin` e todas as policies existentes. A reescrita por dentro dessas helpers, com a mesma assinatura, é a fase 3. O teste confere que a definição de `is_same_clinica` fica idêntica.

## RLS das tabelas novas

| Tabela | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `organizacoes` | plataforma ou `id IN organizacoes_visiveis()` | INSERT e DELETE: plataforma. UPDATE: plataforma ou `gere_organizacao(id)` |
| `membros_organizacao` | o próprio vínculo, plataforma ou gestor da organização | só plataforma |
| `membros_unidade` | o próprio vínculo, plataforma ou `gere_unidade(clinica_id)` (admin da unidade ou gestor da rede) | só plataforma |

`service_role` ignora RLS. `anon` não tem nenhum privilégio nas tabelas nem nas helpers. Na fase 1 a escrita fica só com a plataforma; convite e gestão de equipe passam a escrever via RPC `SECURITY DEFINER` na fase 2.

## Backfill (idempotente)

1. Uma organização por clínica sem organização (`clinica_origem_id` garante 1:1 e permite reexecutar).
2. `clinicas.owner_id` vira `dono` da organização.
3. `membros_unidade` = clínica de casa do perfil × `user_roles`:
   - administrador da plataforma em impersonação recebe o vínculo em `platform_admins.original_clinica_id`, nunca na clínica impersonada;
   - quem tem cadastro em `funcionarios` só inativo naquela clínica entra com `ativo = false`;
   - perfil sem clínica não ganha vínculo.
4. Ao final, `RAISE NOTICE` com as contagens do gate da fase 1.

## Gate da fase 1 (rodar depois de aplicar)

```sql
-- deve ser 0
SELECT count(*) FROM public.clinicas WHERE organizacao_id IS NULL;
-- deve ser 0 (perfis com clínica e papel sem vínculo)
SELECT count(DISTINCT p.id)
  FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
 WHERE p.clinica_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.membros_unidade m WHERE m.user_id = p.id);
-- divergência por papel (fonte para o job de reconciliação da fase 2)
SELECT p.id, p.clinica_id, ur.role
  FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
 WHERE p.clinica_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.membros_unidade m
                    WHERE m.user_id = p.id AND m.clinica_id = p.clinica_id AND m.papel = ur.role);
```

A terceira consulta lista também administradores da plataforma em impersonação (esperado: o vínculo deles fica na clínica original).

## Limitações conhecidas

- Sem dupla escrita: usuários e papéis criados depois da aplicação não ganham vínculo até a fase 2. Como nada lê as tabelas novas, não há impacto no app; o bloco de backfill pode ser reexecutado.
- O vínculo nasce do papel **global** atual: quem é admin hoje vira admin da sua clínica de casa. Papéis diferentes por unidade só existem depois da fase 4.
- Usuários com histórico em várias clínicas (troca de `profiles.clinica_id`) ganham vínculo só na clínica atual.
- `clinicas.organizacao_id` segue nullable; criação de clínica nova não cria organização até a fase 2.

## Reversão

Bloco `DROP` no cabeçalho da migration. Nada depende destes objetos na fase 1.

## Verificação executada

`node teste-multiunidade.mjs supabase/migrations/20261029100000_multiunidade_fase1_expand.sql` com `@electric-sql/pglite@0.3.15` instalado fora do repositório: **28 casos, todos passaram** (backfill, idempotência, helpers existentes intactas, mesma clínica permitida, outra clínica negada, anon negado, plataforma). O teste usa stubs mínimos de `clinicas`, `profiles`, `user_roles`, `funcionarios`, `platform_admins` e `auth.uid()`; não reproduz o schema completo de produção.

`NÃO VERIFICADO`: aplicação contra o schema real (CI com banco efêmero), `EXPLAIN` das helpers e grants reais na VPS.
