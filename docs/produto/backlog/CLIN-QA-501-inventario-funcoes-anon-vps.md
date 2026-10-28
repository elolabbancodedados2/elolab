# CLIN-QA-501: Inventário somente leitura das funções executáveis por anon na VPS

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-001 (achados 301, 302, 303, 313, 203) |
| Gravidade | P0 (suspeito até este inventário) |
| Impacto | Segurança e clínico. Confirma ou derruba o vazamento entre clínicas via RPC |
| Perfil | Responsável técnico pela plataforma (executa); Segurança e DBA (interpretam) |
| Esforço | S |
| Dono sugerido | `security-engineer` (consultas e leitura do resultado); o responsável executa na VPS |
| Dependências | Autorização do responsável para acesso só leitura. Consultas em `docs/seguranca/consultas-vps-somente-leitura.sql` (rodada 1, `security-engineer`) |
| Status | Bloqueado por decisão do responsável (27/10, após a rodada 2) |

## Contexto
O diagnóstico confirmou no código que `link_portal_paciente` e `platform_get_clinicas_saude` pulam a checagem de tenant quando `auth.uid()` é nulo e não revogam `anon`. Ainda não se sabe se a VPS concede `EXECUTE` a `anon`. Sem esse dado, o 001 continua "suspeito" e a allowlist da CLIN-QA-502 é um palpite.

## Evidência
- `supabase/migrations/20261011010000_portal_paciente_scoped_links.sql:17-35,60-61` (diagnóstico D.1 #1).
- `20260817210000…sql:127-128`; `20260817240000…sql:44` (D.1 #2).
- Nenhum `ALTER DEFAULT PRIVILEGES` nas migrations (D.1 #1). Na VPS: NÃO VERIFICADO.

## Causa provável
O privilégio padrão concede `EXECUTE` a `anon` em funções novas; a revogação de 28/07 foi pontual.

## Proposta
Rodar, só leitura, `select proname from pg_proc where prosecdef and has_function_privilege('anon', oid, 'execute')`, mais os privilégios padrão (`pg_default_acl`) e as policies permissivas. Anexar o resultado, sem segredos, em `docs/seguranca/`.

## Critérios de aceite
- **CA1 (caminho principal).** Dado o acesso só leitura autorizado, quando o responsável roda as consultas, então o resultado (função, schema, `prosecdef`, quem executa) fica anexado com data e versão do banco.
- **CA2 (classificação).** Dado o resultado, quando a Segurança o lê, então cada função recebe uma classe ("deve ser pública", "deve ser revogada" ou "precisa de análise") com justificativa de uma linha.
- **CA3 (outra clínica).** Dada cada função "deve ser revogada" que lê dado de clínica, quando a Segurança analisa o corpo dela, então o relatório diz se uma chamada anon devolveria dado de qualquer clínica (sim ou não, com `caminho:linha`).
- **CA4 (permissão negada / somente leitura).** Dada a sessão só leitura, quando alguém tenta DDL ou DML, então o banco recusa. O arquivo de consultas não contém `UPDATE`, `DELETE`, `INSERT`, `GRANT`, `REVOKE`, `ALTER` nem `DROP` (conferido por grep).
- **CA5 (erro).** Dado que a consulta falha (permissão, timeout), quando isso acontece, então o 001 continua "suspeito" e o motivo fica registrado. Ninguém marca o item como derrubado sem a lista.
- **CA6 (sigilo).** O anexo não contém senha, chave, string de conexão nem dado de paciente.

## Definição de pronto
DoD comum do `README.md`, mais: resultado anexado; o 001 sai de "suspeito" para confirmado ou derrubado; a allowlist da CLIN-QA-502 é atualizada com base no resultado.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto (E1)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Existe o roteiro só leitura `docs/seguranca/consultas-vps-somente-leitura.sql` (rodada 1). A segurança conferiu que ele só tem blocos `READ ONLY`. Nunca foi executado.
- Na rodada 2 entraram consultas que dependem desta mesma execução: 2.5 da `docs/seguranca/auditoria-rodada-2.md` (exposição do CLIN-QA-512), 6.1 (tokens do portal em texto puro, pré-requisito do SEC-R1-06) e 8.1 (papéis de `cron.job`, pré-requisito da 502).

### O que falta
- O responsável roda o roteiro na VPS e anexa a saída (gate C1). Antes, a lista de migrations embutida precisa ser gerada de novo.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
