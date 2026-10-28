# CLIN-QA-516: Diff de schema produção × repositório e correção da versão duplicada

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-006 (104, 201, 318) |
| Gravidade | P1 (gate) |
| Impacto | Clínico e de operação. Sem saber o que está aplicado, nenhuma correção de segurança pode ser dada como feita, e funções falham em produção |
| Perfil | Responsável técnico; Tech Lead; DBA |
| Esforço | M |
| Dono sugerido | `tech-lead` + `database-engineer`; o responsável executa as leituras na VPS |
| Dependências | Autorização de leitura na VPS (mesma janela da CLIN-QA-501); ADR 0002 (rodada 1, `software-architect`) |
| Status | Bloqueado por decisão do responsável (27/10, após a rodada 2) |

## Contexto
As migrations foram aplicadas à mão pelo SQL Editor. Há dois arquivos com o mesmo prefixo de versão.

## Evidência
- Conferido nesta rodada: `ls supabase/migrations | wc -l` = 454; prefixo duplicado `20261010198000` (`ls supabase/migrations | cut -c1-14 | sort | uniq -d`).
- Drift na VPS: SÓ RELATADO (`docs/AUDITORIA_MODULOS_QA.md:60-78`).

## Proposta
Diff schema-only da produção contra um `db reset` local; lista do que falta ou sobra; renomear a versão duplicada com plano de `migration repair` (executado só com backup e autorização).

## Critérios de aceite
- **CA1 (caminho principal).** Dado o dump schema-only da produção e um `db reset` local, quando comparados, então o diff fica anexado e cada diferença tem dono e decisão (aplicar, reverter ou documentar).
- **CA2 (versões únicas).** Dado o repositório, quando se roda `ls supabase/migrations | cut -c1-14 | sort | uniq -d`, então a saída é vazia.
- **CA3 (outra clínica).** Dadas as diferenças em policies, grants ou funções `SECURITY DEFINER`, quando listadas, então cada uma diz se afeta o isolamento entre clínicas e entra antes das demais.
- **CA4 (permissão negada).** A leitura usa credencial só leitura; nenhum comando de escrita (incluindo `migration repair`) roda sem autorização registrada e backup.
- **CA5 (erro).** `npm run check:colunas` sem divergência entre o código e o schema esperado.

## Definição de pronto
DoD comum, mais: diff anexado sem segredos; plano de repair revisado pelo DBA.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- O database-engineer documentou o tratamento da versão duplicada em `docs/arquitetura/banco/versoes-duplicadas.md`: tabela de decisão A a D, renome de `mercadopago_oauth_clinicas` (idempotente) para `20261010198500` e `migration repair`. Nada foi renomeado.
- O prefixo continua duplicado: 456 arquivos, `uniq -d` → `20261010198000` (PO, 27/10).

### O que falta
- Leitura da tabela de histórico de migrations na VPS (passo 1 do documento) e o diff de schema, ambos dependentes de C1.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
