# E08-fila-jobs: backend-developer

## O que fiz
Implementei a ADR 0003 (fila de jobs). Cobre a fase 1 (expand) e o produtor do WhatsApp (fase 3) atrás de uma flag por clínica. Nada foi aplicado nem publicado.

1. **Migration local** `supabase/migrations/20261029120000_fila_jobs.sql`:
   - Tabela `jobs` com `UNIQUE (tipo, chave_idempotencia)`, `chave_ordenacao`, `repetivel`, `tentativas`/`max_tentativas`, lease (`bloqueado_ate`) e os estados `pendente | executando | concluido | incerto | dead | cancelado` (DLQ = `dead`). Payload limitado a 8 KB.
   - RLS ligada, sem policy e com `REVOKE` de anon e authenticated. Só a service_role tem acesso.
   - Funções `SECURITY DEFINER` com `search_path = ''`, executáveis só pela service_role:
     - `enfileirar_job`: idempotente; recusa reaproveitar a chave de outra clínica.
     - `reivindicar_jobs`: `FOR UPDATE SKIP LOCKED`; recupera lease expirado (repetível volta a `pendente`, não repetível vai para `incerto`); ordem por chave; no máximo N jobs por clínica em cada lote.
     - `concluir_job`.
     - `falhar_job`: backoff exponencial de 30 s com jitter e teto de 60 min; vai para `dead` quando as tentativas se esgotam ou o erro é definitivo, e para `incerto` quando a falha vem depois de um efeito externo.
     - `limpar_jobs_concluidos`: retenção de 30 dias.
   - pg_cron, só se existir:
     - limpeza diária;
     - worker a cada minuto, com o comando derivado do agendamento `process-notification-queue`, para não gravar o `CRON_SECRET` no arquivo. Se esse agendamento não existir, a migration só emite um NOTICE.
   - Reversão documentada no fim do arquivo.
2. **`supabase/functions/_shared/jobs.ts`**:
   - `enfileirarJob` e `processarLote` (reserva, executa o handler de cada tipo, conclui ou registra a falha individualmente).
   - `ErroJobDefinitivo` e `ErroJobIncerto`.
   - `codigoDeErro`: grava em `ultimo_erro` só o código ou o nome do erro, nunca a mensagem, que pode ter dado pessoal.
3. **whatsapp-webhook**:
   - Novo `fila.ts` com a flag, a montagem do job, a validação do payload, a janela de reentrega e `tokenConfere`.
   - O processamento da mensagem (pesquisa, avaliação, ações pendentes, IA e envio) foi extraído para `processarMensagemRecebida`, sem mudar a lógica (`continue` virou `return`).
   - Modo fila (clínica listada em `WHATSAPP_FILA_CLINICAS`):
     - O webhook grava a mensagem, enfileira `whatsapp.mensagem_recebida` e responde 200 sem chamar a IA.
     - A chave de idempotência é `clinica_id:message_id` e a chave de ordenação é `conversa:<id>`.
     - O job é `repetivel = false`, com 3 tentativas.
   - Reentrega: quando a mensagem já existe (consulta prévia ou erro 23505), o webhook reenfileira de forma idempotente dentro de 15 min. Isso cobre a falha entre gravar a mensagem e enfileirar.
   - Worker: `POST whatsapp-webhook?modo=jobs` exige `cronSecretOk`. Ele recarrega mensagem, sessão e conversa filtrando pelo `clinica_id` do job e confere os vínculos antes de agir. Se algo falhar depois de um envio, o job vai para `incerto` e não é reenviado.
   - Sem a variável, o comportamento síncrono atual continua igual.
   - Fase 0 da ADR (CLIN-QA-217): o token do Evolution agora é comparado em tempo constante.
   - Corrigi também os 2 erros de `deno check` que já existiam (tipo do `alertClient`).

## Arquivos
- `supabase/migrations/20261029120000_fila_jobs.sql` (novo)
- `supabase/functions/_shared/jobs.ts`, `jobs.deno.test.ts`, `jobsMigration.deno.test.ts` (novos)
- `supabase/functions/whatsapp-webhook/index.ts` (alterado), `fila.ts`, `fila_test.ts` (novos)

## Comandos e resultados
- `npx -y deno@2 test -A --no-lock --node-modules-dir=none` nos 3 arquivos de teste → **17 passed, 0 failed**:
  - 6 de SQL em PGlite: idempotência e chave de outra clínica, ordem por conversa, justiça por clínica, backoff até `dead`, `incerto` e definitivo, lease expirado, anon e authenticated negados;
  - 5 do cliente da fila;
  - 6 do modo fila, incluindo a verificação no código-fonte de que o ramo da fila não chama a IA.
- `npx -y deno@2 check` em `index.ts`, `fila.ts` e `jobs.ts` → sem erros (antes, `index.ts` tinha 2 erros).
- `npx vitest run` nos 4 testes que leem o webhook (`communicationWebhookAlert`, `whatsappAgentReplies`, `whatsappAgentWebhookPolicy`, `whatsappReceptionTools`) → 28 passed.
- `npx tsc --noEmit -p tsconfig.app.json` → exit 0.
- `npx eslint` nos arquivos tocados → 0 erros. Os avisos `no-explicit-any` de `index.ts` passaram de 62 para 69, pelas 7 anotações `any` explícitas do recorte.
- Uma execução do Deno sem `--no-lock` alterou `deno.lock`. Restaurei o arquivo com `git checkout -- deno.lock` e ele está limpo.

## Pendências (dependem do responsável)
- Aplicar a migration (ADR 0002) e publicar a função. Depois, ligar o piloto com `WHATSAPP_FILA_CLINICAS=<uuid>`.
- Conferir se o agendamento `jobs-worker-whatsapp` foi criado. Se `process-notification-queue` não existir no cron, ele precisa ser agendado à mão.
- Cutucada por trigger + `pg_net` logo após o INSERT (ADR, regra 10): ficou de fora, porque exige guardar o segredo no Vault. Sem ela, a resposta ao paciente no modo fila pode levar até 1 min (cron).
- `NÃO VERIFICADO`:
  - disputa real entre duas sessões (SKIP LOCKED); o PGlite tem uma conexão só, então isso fica para o pgTAP no CI efêmero;
  - teste (d) da ADR, com a OpenAI simulada a 30 s em ambiente real;
  - limites do edge-runtime na VPS.
- Painel de DLQ (`dead` e `incerto`, reenfileirar e cancelar) e alertas pela idade da fila: fases 4 e DevOps.
- Retenção final de `jobs`: requer avaliação especializada (LGPD).
- Próximo dono: E12 (tech-lead), para revisão e verificação completa.
