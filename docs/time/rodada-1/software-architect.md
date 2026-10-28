# Rodada 1: software-architect

Data: 27/10/2026. Só leitura do código e escrita de documentação. Sem migration, deploy, commit ou acesso à VPS.

## O que fiz

Escrevi três ADRs com contexto, opções, decisão, plano de migração em fases (expand/contract), riscos, itens não verificados e próximo dono. Também incluí diagramas Mermaid.

| ADR | Decisão central |
|---|---|
| 0001 multiunidade | `clinica_id` passa a significar "unidade". Acima dela entra `organizacoes`, e a autorização vem de `membros_unidade (user_id, clinica_id, papel)`. `profiles.clinica_id` vira "unidade ativa" e só vale com vínculo ativo. As helpers `is_same_clinica`, `get_my_clinica_id`, `current_clinica_id` e `has_role` são reescritas por dentro, com a mesma assinatura. As policies existentes continuam restritas à unidade ativa, para que telas com `queryKey` sem tenant não misturem unidades. A visão de rede fica em RPCs próprias. O Custom Access Token Hook fica fora da primeira versão. São 7 fases (0 a 6). |
| 0002 baseline e deploy | O baseline sai da produção reconciliada, não de `migration squash`. Primeiro vem o relatório de drift. Depois o baseline é registrado com `migration repair` sem executar SQL, e os 454 arquivos vão para `migrations_legacy/`. Os deploys passam por `db push --db-url` num GitHub Environment com dois revisores, backup antes e plano em `--dry-run`. O CI troca o `link` com o projeto Cloud por banco efêmero, pgTAP e um gate de prefixo único. |
| 0003 fila de jobs | Tabela `jobs` com `FOR UPDATE SKIP LOCKED`, lease, backoff, `UNIQUE (tipo, chave_idempotencia)`, ordem por chave, limite por clínica em cada lote e `dead` como DLQ, além de `incerto` para efeitos não idempotentes. O webhook só valida, persiste e responde. O worker é disparado por `pg_net` depois do commit, com `pg_cron` como reserva. A ordem de entrada é Mercado Pago, que tem flag de reversão, e depois WhatsApp, com piloto por clínica. `notification_queue` continua como está. |

## Arquivos tocados

- `docs/arquitetura/adr/0001-multiunidade-organizacao-unidades-membros.md` (novo)
- `docs/arquitetura/adr/0002-baseline-migrations-deploy-banco-com-aprovacao.md` (novo)
- `docs/arquitetura/adr/0003-fila-de-jobs-para-webhooks.md` (novo)
- `docs/time/rodada-1/software-architect.md` (este arquivo)

Não alterei nenhum outro arquivo.

## Evidências (comandos executados na raiz e resultados)

| Comando | Resultado |
|---|---|
| `ls supabase/migrations \| wc -l` | 454 |
| `ls supabase/migrations \| cut -c1-14 \| sort \| uniq -d` | `20261010198000` |
| `grep -c -E '^[0-9]{14}_[0-9a-f]{8}-[0-9a-f]{4}'` na lista de migrations | 134 com nome UUID |
| `grep -o "is_same_clinica(" …/*.sql \| wc -l`; o mesmo para `get_my_clinica_id()` e `current_clinica_id()` | 366 / 303 / 54 |
| `grep -o "has_role(" …/*.sql \| wc -l` | 71 |
| `grep -o "(select auth.uid())" -i …/*.sql \| wc -l` | 0 |
| `grep -l "cron.schedule" …/*.sql \| wc -l` | 19 |
| `sed -n 42,69p 20260131002504_…sql` | `user_roles` sem `clinica_id`, `UNIQUE(user_id, role)`; `has_role` sem clínica |
| `sed -n 30,74p 20260727230000_security_fixes_c1_c4.sql` | trigger que protege `profiles.clinica_id`, com a flag `elolab.allow_clinica_change` e exceção de platform admin |
| `sed -n 8,34p 20261011440000_fila_notificacoes_resultado_incerto.sql` | `reivindicar_notificacoes` com `FOR UPDATE SKIP LOCKED` e estado `incerto` |
| `grep -n` em `whatsapp-webhook/index.ts` | token com `!==` em `:45`, deduplicação em `:159-219`, OpenAI em `:410` e `:539`, envio ao Evolution em `:1215` |
| `grep -n` em `mercadopago-webhook/index.ts` | assinatura em `:61-85`, `23505` em `:123`, `processado = true` em `:158,179,311` |
| `sed -n 69,70p .github/workflows/test.yml` | `supabase link --project-ref gebygucrpipaufrlyqqj` |
| WebFetch da referência oficial do CLI (`migration repair`, `db push`, `db dump`, `migration squash`) | flags `--status applied\|reverted`, `--db-url`, `--dry-run` confirmadas; o `squash` descarta comandos de dados e o `db dump` exclui `auth` e `storage` |
| WebFetch da documentação do Custom Access Token Hook | `app_metadata` é um claim opcional que o hook pode gravar; a página não documenta a configuração self-hosted |

Correção registrada: o relatório `02-engenharia` cita o token do WhatsApp em `:38`, mas no worktree atual ele está em `:45`.

## Riscos principais

- **ADR 0001:** um erro na reescrita de `is_same_clinica` abre ou fecha o acesso para todos (P0 se abrir). Por isso ela depende de pgTAP de isolamento no CI e da ADR 0002. As funções `SECURITY DEFINER` que leem `profiles.clinica_id` direto precisam de inventário antes da fase 3. Impersonação e convite precisam de revisão de código (`NÃO VERIFICADO`).
- **ADR 0002:** um `migration repair` errado pode reaplicar migrations antigas. Também há risco de expor o Postgres ou o secret no pipeline. O baseline pode sair sem cron, storage, realtime e grants.
- **ADR 0003:** um handler não idempotente pode duplicar uma cobrança ou uma mensagem. Se `pg_net` ou `pg_cron` pararem sem alerta, a fila cresce sem ninguém perceber.
- Pacientes compartilhados entre unidades e a retenção do payload de jobs requerem avaliação especializada (LGPD).

## Não verificado

Estado real da VPS: drift, grants, rede do Postgres no Easypanel, limites do edge-runtime, `pg_net`/`pg_cron` ativos e configuração de hooks do GoTrue. Também não revisei o código de impersonação e de convite. Não rodei build, testes nem `EXPLAIN`, porque não eram necessários para documentação.

## Próximo dono

- `tech-lead`: aprovar as ADRs com o responsável, abrir as tarefas da fase 0 (gate de prefixo, CI com banco efêmero) e a fase 1 da ADR 0003.
- DB Eng: pgTAP de isolamento, inventário de funções que leem `profiles.clinica_id` e relatório de drift. O relatório de drift depende de autorização do responsável para leitura na VPS.
- DevOps/SRE: backup off-site (pré-requisito da ADR 0002), Environment de aprovação e alertas de fila.

Pendente da minha função: `docs/arquitetura/visao-geral.md` não estava no escopo desta rodada.
