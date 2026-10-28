# CLIN-QA-509: Backup off-site criptografado e primeira restauração cronometrada

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-005 (308, 309, SRE 1–3), contenção 7.5 |
| Gravidade | P0 (risco latente) |
| Impacto | Clínico. Perder a VPS hoje é perder o dado clínico de todas as clínicas |
| Perfil | Responsável técnico pela plataforma; SRE. Beneficiário: todas as clínicas |
| Esforço | M |
| Dono sugerido | `devops-sre` |
| Dependências | Conta de storage externo (R2/S3 em outra região) contratada pelo responsável; chave guardada fora da VPS |
| Status | Bloqueado por decisão do responsável (27/10, após a rodada 2) |

## Contexto
`auto-backup` copia buckets do próprio Storage para o bucket `backups` da mesma instância. Não há cópia fora da VPS, nem restauração testada.

## Evidência
- Diagnóstico D.1 #10: `supabase/functions/auto-backup/index.ts:131-170`.
- Backups do Easypanel: NÃO VERIFICADO.

## Proposta
`pg_dump` diário (ou pgBackRest) criptografado, enviado a storage em outra região, com chave fora da VPS; restauração cronometrada numa VM descartável.

## Critérios de aceite
- **CA1 (caminho principal).** Dado o job diário configurado, quando roda, então um arquivo criptografado com data fica no storage externo e o tamanho e o hash são registrados.
- **CA2 (restauração).** Dado o último backup, quando restaurado numa VM descartável, então o relatório traz o RTO medido (meta: até 4 h) e as contagens por tabela crítica (`pacientes`, `prontuarios`, `prescricoes`, `agendamentos`, `lancamentos`) iguais às da origem no horário do dump.
- **CA3 (outra clínica).** Dado o banco restaurado, quando um usuário de teste da clínica A consulta pela API, então só vê dados da A (RLS e grants restaurados junto, conferidos com a suíte da CLIN-QA-511 ou consulta equivalente).
- **CA4 (permissão negada).** Dado um usuário de clínica ou a service key da aplicação, quando tenta listar ou baixar o backup externo, então é negado; só a credencial de backup, guardada fora da VPS, tem acesso.
- **CA5 (sigilo).** O arquivo no storage não abre sem a chave. Nenhuma chave, senha ou string de conexão aparece em log, no repositório ou no relatório.
- **CA6 (erro).** Dado que o envio falha, quando isso acontece, então um alerta externo chega ao responsável no mesmo dia (não só log na VPS).

## Definição de pronto
DoD comum, mais: runbook de restauração versionado em `docs/operations/`; relatório da primeira restauração anexado com RTO e contagens; nenhum dado real fora do ambiente autorizado.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- `scripts/ops/backup-offsite.sh` e `docs/operations/backup-e-restauracao.md` (rodada 1; `bash -n` e ShellCheck sem aviso). Nunca rodou contra um Postgres. Sem novidade na rodada 2.

### O que falta
- Decisões D1 a D4 (bucket, monitor, custódia de chaves), instalação autorizada na VPS e o primeiro `restore-drill` com RTO medido (gate C6).

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
