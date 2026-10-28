# CLIN-QA-503: `link_portal_paciente` e `platform_get_clinicas_saude` exigem identidade e tenant mesmo sem sessão

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-001 (301, 303) |
| Gravidade | P0 |
| Impacto | Clínico. Sem a correção, anon gera link de portal válido por 1 ano para qualquer `paciente_id` e lê a saúde de todas as clínicas |
| Perfil | Recepção (gera o link do portal); admin de plataforma (vê a saúde das clínicas); visitante não autenticado |
| Esforço | S |
| Dono sugerido | `database-engineer`; revisão do `security-engineer` |
| Dependências | Pode ir na mesma migration da CLIN-QA-502. Aplicação com autorização e backup |
| Status | Aguardando aplicação (27/10, após a rodada 2) |

## Contexto
As duas funções só checam a clínica `IF auth.uid() IS NOT NULL`. Revogar anon (502) fecha a porta, mas a função continua insegura se alguém reconceder o grant. A defesa precisa estar no corpo da função.

## Evidência
- `supabase/migrations/20261011010000_portal_paciente_scoped_links.sql:17-20,32-35` (checagens condicionais).
- `20260817210000…sql:127-128`; `20260817240000…sql:44`.

## Proposta
Trocar `IF auth.uid() IS NOT NULL` por exigência de `auth.uid()`. Se houver chamada legítima por trigger, a exceção é `pg_trigger_depth() > 0`, confirmada pelo DBA.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um usuário da recepção da clínica A autenticado, quando gera o link do portal para um paciente da clínica A, então o link é criado como hoje.
- **CA2 (outra clínica).** Dado um usuário da clínica A, quando chama `link_portal_paciente` com o `paciente_id` de um paciente da clínica B, então a função recusa e nenhum token é criado.
- **CA3 (sem sessão).** Dada uma chamada sem `auth.uid()` (com o grant de anon reconcedido de propósito no teste), quando qualquer das duas funções é executada, então ela levanta erro e não devolve dado.
- **CA4 (permissão negada).** Dado um usuário autenticado que não é admin de plataforma, quando chama `platform_get_clinicas_saude`, então recebe erro de permissão e nenhuma linha.
- **CA5 (perfil sem papel).** Dado um usuário da clínica A cujo papel não permite gerar link (conforme a matriz de permissões, por exemplo laboratório), quando chama `link_portal_paciente`, então recebe erro de permissão.
- **CA6 (erro traduzido).** A tela que gera o link mostra a mensagem de `src/lib/erros.ts` quando a função recusa.

## Definição de pronto
DoD comum, mais: teste de banco (pgTAP ou spec com banco local) com os casos CA2 a CA5; revisão de segurança registrada.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **testado localmente (E2)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- As duas RPCs estão na mesma migration da 502: `link_portal_paciente` (`:106-123`) e `platform_get_clinicas_saude` (`:198-216`) passam a recusar também pelo papel da sessão (`current_setting('role')`), sem depender só de `request.jwt.claims`.
- Os casos R3 (anon e authenticated sem JWT recebem `42501`; service_role e cron interno passam) estão entre os 63 casos PGlite reexecutados pelo PO.

### O que falta
- Confirmar em homologação como o PostgREST da VPS define o papel (premissa NÃO VERIFICADA).
- Mesmas condições de aplicação da 502.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
