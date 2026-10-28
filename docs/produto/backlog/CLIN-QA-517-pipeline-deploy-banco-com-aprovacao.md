# CLIN-QA-517: Deploy de banco por pipeline com aprovação e CI desligado do projeto Cloud

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-006 (201, 204, SRE 4 e 7) |
| Gravidade | P1 (gate) |
| Impacto | Operação. Acaba com a aplicação manual pelo SQL Editor e com o CI apontando para um projeto que não é a produção |
| Perfil | Responsável técnico (aprova); engenharia (propõe) |
| Esforço | M |
| Dono sugerido | `devops-sre` + `tech-lead` |
| Dependências | CLIN-QA-516 (baseline); ADR 0002 (rodada 1, `software-architect`); CLIN-QA-518 (staging) |
| Status | Aberto (parcial) (27/10, após a rodada 2) |

## Evidência
- `.github/workflows/test.yml:68-70`: `supabase link --project-ref gebygucrpipaufrlyqqj` e `db lint --linked`.
- `supabase/APLICAR_MIGRATIONS.md:1-10` (SÓ RELATADO): aplicação manual.

## Critérios de aceite
- **CA1 (caminho principal).** Dada uma migration nova aprovada, quando o pipeline roda, então ela é aplicada primeiro em staging e, só depois da aprovação do responsável, na produção, com registro de quem aprovou e quando.
- **CA2 (permissão negada).** Dado um usuário sem papel de aprovador, quando tenta disparar o deploy de produção, então o pipeline bloqueia.
- **CA3 (backup antes).** Dado um deploy de produção, quando começa, então um backup verificado (CLIN-QA-509) com menos de 24 h é exigido, senão o pipeline para.
- **CA4 (sem Cloud).** Dado o workflow de CI, quando se procura por `project-ref` de Cloud, então não há; o `db lint` roda contra o banco efêmero (CLIN-QA-510).
- **CA5 (outra clínica).** Dado o deploy, quando termina, então a suíte de isolamento (CLIN-QA-511) roda contra staging e o resultado fica anexado ao deploy.
- **CA6 (erro).** Dada uma migration que falha, quando o pipeline roda, então a transação é desfeita, a produção não muda e o responsável é avisado.

## Definição de pronto
DoD comum, mais: `supabase migration list` sem divergência entre repositório, staging e produção depois do primeiro deploy pelo pipeline.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- O CI deixou de usar o projeto Cloud: o `supabase link` saiu do `static-checks` (`.github/workflows/test.yml:54-55`), e o secret `SUPABASE_ACCESS_TOKEN` ficou sem uso (devops-sre, rodada 2).
- O pipeline de deploy de banco com aprovação ainda não existe.

### O que falta
- Pipeline com aprovação, depois da 516 e da 518.
- O responsável pode revogar o secret sem uso.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
