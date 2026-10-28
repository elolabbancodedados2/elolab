# Rodada 1: backend-developer

## O que fiz
Criei a anonimização LGPD em uma única transação, que substitui a exclusão tabela por tabela suspensa no CLIN-QA-004. Só criei arquivos novos e não alterei `src/lib/lgpdCompliance.ts`.

- `supabase/migrations/20261028100000_lgpd_anonimizacao_transacional.sql`: migration local, ainda não aplicada.
  - Cria a função `lgpd_anonimizar_paciente(p_paciente_id, p_clinica_id, p_motivo, p_confirmacao)`, com `SECURITY DEFINER`, `search_path = public, pg_temp`, `REVOKE` de `PUBLIC`/`anon` e `GRANT` só para `authenticated`.
  - No servidor, a função exige sessão, `is_admin` e `is_same_clinica`. Trava o paciente da clínica (`FOR UPDATE`) e exige que o nome atual seja digitado para confirmar.
  - Recusa a operação quando há agendamento de hoje em diante ou atendimento em aberto.
  - Limpa a identificação e o contato do cadastro e marca `anonimizado_em`/`anonimizado_por`, que tornam a chamada idempotente.
  - Também limpa as cópias desses dados: `guias_externas`, títulos e descrições de `tarefas` e os valores antigos de `audit_log` do cadastro. As linhas de auditoria continuam.
  - Desativa os tokens do portal, remove a lista de espera e desvincula as conversas de WhatsApp.
  - Grava em `lgpd_deletion_log` (colunas novas `operacao` e `detalhes`) na mesma transação.
  - Não altera prontuário, prescrição, exame, anexo, `lancamentos` nem `pagamentos_mercadopago`.
- `src/lib/lgpdAnonimizacao.ts`:
  - Valida a entrada com zod e chama a função do banco.
  - Traduz o código de erro, que vem em `HINT`, para uma mensagem em português.
  - Remove a foto do bucket `patient-photos` depois do commit e lista o que ficou para tratamento manual.
- `src/lib/__tests__/lgpdAnonimizacao.test.ts`: testa o cliente (com mock) e o texto da migration.

## Evidência
- `npx vitest run src/lib/__tests__/lgpdAnonimizacao.test.ts`: 17 de 17 testes passaram, na última execução depois da correção de tipo.
- `npx eslint` nos dois arquivos: nenhum problema.
- `tsc`: a primeira execução apontou um erro de tipo na união da resposta, já corrigido. Não rodei de novo por orientação do orquestrador. **NÃO VERIFICADO**: fica para o QA.
- **NÃO VERIFICADO**: a função ainda não rodou em nenhum Postgres, porque o repositório não tem PGlite nem pgTAP.

## Riscos
- **Requer avaliação especializada (jurídica e DPO):** manter o prontuário ligado a um cadastro anonimizado (LGPD art. 16, Lei 13.787/2018) e apagar valores antigos de `audit_log` (CFM 1.821/2007).
- Continuam no banco e precisam de tratamento manual: as mensagens e o número (`remote_jid`) de WhatsApp, e o texto livre do prontuário que cite o nome.
- A migration acrescenta colunas a `pacientes` e a `lgpd_deletion_log`. Depois de aplicada, o `types.ts` precisa ser gerado de novo.
- Nenhuma tela usa a função ainda.

## Próximo dono
- database-engineer/security-engineer: revisar a migration e testá-la num banco descartável.
- QA: rodar `tsc` e a suíte completa.
- Responsável e DPO: dar o parecer jurídico.
- frontend-developer: ligar a função à tela `/lgpd-pacientes`, só depois desse parecer.
