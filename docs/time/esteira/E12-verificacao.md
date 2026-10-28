# E12-verificacao (tech-lead)

Estado: **PARCIAL**. A verificação completa está em andamento e este arquivo será atualizado com os números finais.

## 1. P0/P1 de E04
- `docs/seguranca/auditoria-funcoes-publicas.md:37` registra que não há P0 nem P1 confirmado. Os achados são CLIN-QA-316 (P2) e CLIN-QA-320 (P2).
- Conferi a classificação do CLIN-QA-316. A chave única (`supabase/functions/whatsapp-webhook/index.ts:42,72-80`) só é conhecida pelo servidor Evolution. Forjar um evento exige vazamento da chave, e o caminho de processamento filtra por `clinica_id` da sessão. P2 mantido.
- Nada a corrigir como P0/P1.

## 2. Revisão rápida dos diffs da esteira
Até aqui, nenhum P0 ou P1.
- E07: `src/lib/queryKeys.ts:22-50` põe `clinica_id` em primeiro na chave. `prefixoTabela` preserva o prefixo legado `[tabela]`, igual a `src/hooks/useSupabaseData.ts:42,149`. O grep das chaves antigas em `src` e `tests` voltou vazio.
- E06: `src/components/MFAObrigatorio.ts:27-35`. Se a RPC falhar, a função devolve `false` e não bloqueia o login enquanto a migration não estiver aplicada.
- E08: o worker exige `x-cron-secret` (`whatsapp-webhook/index.ts:57-61`). `processarJobMensagem` filtra mensagem, sessão e conversa por `job.clinica_id` (`:725-750`).
- E03: os secrets saíram do nível do workflow e ficaram só no job que os usa (`.github/workflows/test.yml`).
