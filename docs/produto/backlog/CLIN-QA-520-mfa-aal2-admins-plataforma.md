# CLIN-QA-520: API exige AAL2 de admins de plataforma e na impersonação

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-007 (304), ação 30.3 |
| Gravidade | P1 |
| Impacto | Segurança. Admin de plataforma enxerga todas as clínicas; com senha vazada, o token AAL1 basta na API |
| Perfil | Admin de plataforma (inclui impersonação de clínica) |
| Esforço | M |
| Dono sugerido | `security-engineer` (regra) + `database-engineer` (policies) + `backend-developer` (edge functions de plataforma) |
| Dependências | CLIN-QA-517 (deploy de banco controlado); MFA cadastrado por todos os admins antes de ativar |
| Status | Aberto (27/10, após a rodada 2) |

## Contexto
A exigência de segundo fator existe só na tela de login. Nenhuma policy ou função lê `aal`.

## Evidência
- `src/pages/Auth.tsx:149-158`: `getAuthenticatorAssuranceLevel` decide só no cliente (conferido nesta rodada).
- Diagnóstico D.1 #8: nenhuma ocorrência de `aal` em SQL.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um admin de plataforma que entrou com senha e TOTP (AAL2), quando usa o painel de plataforma e a impersonação, então tudo funciona como hoje.
- **CA2 (permissão negada).** Dado um admin de plataforma com token AAL1 (só senha), quando chama direto pela API qualquer RPC ou tabela de plataforma, ou inicia impersonação, então recebe erro de permissão.
- **CA3 (MFA obrigatório).** Dado um admin de plataforma sem fator cadastrado, quando entra, então é levado a cadastrar o TOTP antes de qualquer tela de plataforma.
- **CA4 (outra clínica).** Dado um admin de plataforma em impersonação da clínica A com AAL2, quando a sessão cai para AAL1 (fator removido ou token antigo), então perde acesso aos dados da A e de qualquer outra clínica.
- **CA5 (usuário comum não afetado).** Dado um usuário de clínica sem fator cadastrado, quando usa o sistema, então nada muda (regra da CLIN-QA-521 à parte).
- **CA6 (erro traduzido).** A tela mostra "Confirme o segundo fator para continuar." em vez do erro técnico.

## Definição de pronto
DoD comum, mais: teste com token AAL1 e AAL2 contra banco local; revisão de segurança; plano de ativação comunicado aos admins.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem correção escrita. `grep -rln aal2 supabase/migrations supabase/functions` não devolve nada (PO, 27/10).

### O que falta
- Correção no servidor pelo security-engineer e pelo database-engineer.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
