# CLIN-QA-528: Tipos do banco gerados no CI com gate de diff

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-014 (209) |
| Gravidade | P1 |
| Impacto | Engenharia. Cerca de 275 `(supabase as any)` escondem colunas erradas, que só quebram em produção |
| Perfil | Equipe de engenharia |
| Esforço | S |
| Dono sugerido | `devops-sre` (job); `frontend-developer` (correções) |
| Dependências | CLIN-QA-510 (banco efêmero no CI) |
| Status | Aberto (27/10, após a rodada 2) |

## Evidência
- Diagnóstico D.2: 275 `(supabase as any)` no worktree. Não recontado nesta rodada.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um PR, quando o CI roda, então gera os tipos a partir do banco efêmero e falha se diferirem do arquivo versionado.
- **CA2 (teto).** Dada a contagem de `(supabase as any)` no CI, quando sobe em relação à linha de base, então o job falha.
- **CA3 (outra clínica e permissão).** Não se aplica diretamente: é verificação de build. Os tipos não podem conter dados nem segredos (conferido no diff).
- **CA4 (erro).** Dada falha na geração, quando ocorre, então o job falha com mensagem clara, não passa em silêncio.

## Definição de pronto
DoD comum, mais: execução do CI com diff zero anexada; linha de base de `as any` registrada por script versionado.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem trabalho nas rodadas 1 e 2.

### O que falta
- Depende da 510.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
