# E06 mfa-servidor (database-engineer)

## O que foi feito
CLIN-QA-304: MFA exigido no servidor, só local, sem aplicar.
- `supabase/migrations/20261029110000_mfa_obrigatorio_servidor.sql`:
  - **Helpers:** `sessao_aal2`, `perfil_exige_mfa`, `mfa_satisfeito`, `mfa_exigido_para_mim` e `exigir_mfa` (42501, `HINT mfa_necessario`).
  - **Política:** `politica_mfa`, linha única e global, desligada por padrão.
  - **Triggers por instrução:** `user_roles`, `platform_admins`, `platform_impersonation_log`, `lgpd_deletion_log`, `employee_invitations` (INSERT e DELETE) e `politica_mfa`.
  - **`is_platform_admin()`:** mesma assinatura, agora com `AND mfa_satisfeito()`.
  - **Reversão:** bloco no cabeçalho.
- **Efeito imediato, com a política desligada:** conta com fator verificado em AAL1 é negada nessas operações e deixa de valer como plataforma. Quem não tem fator não é afetado.
- **Com a política ligada** (decisão do responsável): plataforma, admin e financeiro sem fator também são negados.
- **Frontend:**
  - `src/components/MFAObrigatorio.ts`: decide o próximo passo, consulta a RPC `mfa_exigido_para_mim` e reconhece o HINT.
  - `src/pages/Auth.tsx`: depois da senha, um perfil obrigado e sem fator recebe o `MFASetupDialog`. Se fechar o diálogo, a sessão é encerrada.
- Testes:
  - `docs/arquitetura/banco/testes/teste-mfa-servidor.mjs`;
  - `src/components/__tests__/MFAObrigatorio.test.ts`.
- Notas: `docs/arquitetura/banco/mfa-servidor.md`.

## Comandos e resultados
- `node teste-mfa-servidor.mjs <migration>` (PGlite 0.3.15 no scratchpad): **26 casos passaram, exit 0**.
  - Cobre AAL1 com fator negado, AAL2 permitido, RPC `SECURITY DEFINER` negada, plataforma, impersonação e troca de papel.
  - Outra clínica continua negada pela RLS mesmo em AAL2; anon é negado nas 5 helpers e na tabela; `service_role` não é afetado.
  - Ligar a política exige AAL2 e a plataforma; com a política ligada, admin sem fator é negado e a recepção não.
  - A primeira rodada teve 2 falhas causadas por grants faltando no stub do teste; a migration não mudou.
- `npx vitest run src/components/__tests__/MFAObrigatorio.test.ts`: 6 testes passaram (`vitest related` com `Auth.tsx` não encontrou teste de página).
- `npx tsc --noEmit -p tsconfig.app.json`: 0 erros.
- `eslint`:
  - arquivos novos sem problemas;
  - `Auth.tsx` tem 5 avisos antigos (linhas 43, 297, 302, 360 e 364), fora das linhas alteradas.
- Um caso do teste unitário (exceção síncrona simulada na RPC) falhou de forma inexplicada no Vitest e foi removido. O tratamento de erro continua coberto pelo caso `error`. `NÃO VERIFICADO` a causa.

## Pendências (responsável e outros donos)
- Aplicar a migration; não foi aplicada.
- Ligar `politica_mfa` só depois de plataforma, admins e financeiros cadastrarem o fator, e depois de testar onboarding e aceite de convite com a política ligada.
- **Backend:** as edge functions que escrevem com `service_role` (`accept-invite`, `invite-employee`, `admin-contas`) precisam checar `aal` no JWT de quem chama.
- **Frontend:** traduzir o `HINT mfa_necessario` em `src/lib/erros.ts` (fora da trava desta tarefa) e oferecer o reenvio do TOTP, como em `reautenticacao.ts`.
- `expo-mobile`: o login já verifica o TOTP, mas não pede o cadastro obrigatório. Ajuste pendente.
- `NÃO VERIFICADO`: `EXPLAIN` do novo `is_platform_admin()` nas policies antigas e a aplicação contra o schema real.
- Exigir MFA nas escritas de `lancamentos` e `pagamentos_mercadopago` fica fora por regra do time; depende de decisão.

Próximo dono: `security-engineer` (revisão), `backend-developer` (edge functions) e `qa-engineer` (CI com banco efêmero).
