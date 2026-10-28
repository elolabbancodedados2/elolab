# CLIN-QA-519: Convite recusa usuário já vinculado a outra clínica

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-008 (202, 314), ação 30.4 |
| Gravidade | P1 |
| Impacto | Segurança e clínico. Um admin da clínica A que aceita convite da B vira admin na B e acumula papéis, porque `user_roles` não tem `clinica_id` |
| Perfil | Administrador da clínica (convida); funcionário (aceita) |
| Esforço | S |
| Dono sugerido | `database-engineer`; revisão do `security-engineer` |
| Dependências | Leitura do corpo vigente de `accept_employee_invitation` (SÓ RELATADO no diagnóstico); migration local, aplicação com autorização |
| Status | Aberto (27/10, após a rodada 2) |

## Evidência
- `user_roles` sem `clinica_id`: `20260131002504…sql:43-50` (diagnóstico D.1 #4).
- Convite: `20260727230000…sql:288-300`; versões ambíguas corrigidas em `supabase/migrations/20260729180000_convite_funcao_ambigua.sql:9-13`. Corpo vigente: NÃO VERIFICADO.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um usuário sem clínica, quando aceita um convite válido da clínica B, então fica vinculado à B com o papel do convite.
- **CA2 (outra clínica).** Dado um usuário vinculado à clínica A, quando aceita um convite da clínica B, então o aceite é recusado com mensagem traduzida ("Este usuário já está vinculado a outra clínica. Peça ao administrador para usar outro e-mail."), e `profiles.clinica_id` e `user_roles` não mudam.
- **CA3 (mesma clínica).** Dado um usuário da clínica A, quando aceita um novo convite da própria A, então o papel é atualizado conforme a regra atual, sem duplicar.
- **CA4 (permissão negada).** Dado um convite expirado, já usado ou destinado a outro e-mail, quando alguém tenta aceitar, então é recusado e nada muda.
- **CA5 (papéis acumulados já existentes).** Dados usuários que hoje têm papéis vindos de clínicas diferentes, quando a consulta só leitura roda, então a lista fica anexada para decisão do responsável (sem correção automática).
- **CA6 (erro).** Dada falha no meio do aceite, quando ocorre, então nada fica pela metade (transação única).

## Definição de pronto
DoD comum, mais: teste de banco (pgTAP ou spec local) com CA2 e CA4; admin da A sem leitura nem escrita na B depois da tentativa.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem correção escrita. A auditoria da rodada 2 mostra que o defeito também pesa na LGPD: um admin da clínica B que aceita convite de A herda o papel global e poderia anonimizar em A (`docs/seguranca/auditoria-rodada-2.md`, seção 6).

### O que falta
- Correção pelo database-engineer, com teste de duas clínicas.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
