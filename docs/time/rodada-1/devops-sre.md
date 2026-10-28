# Rodada 1 — devops-sre

Data: 27/10/2026. Nesta rodada não houve deploy, migration, commit nem acesso à VPS, ao Easypanel, ao bucket ou ao DNS. `.github/` não foi alterado.

## O que fiz
- **`scripts/ops/backup-offsite.sh` (novo)** tem quatro subcomandos:
  - `backup`: roda na VPS, no cron diário. Gera `pg_dumpall --roles-only` e `pg_dump -Fc`. As contagens de todas as tabelas de `public`, `auth` e `storage` e o md5 de 6 tabelas clínicas são tirados **no mesmo snapshot** do dump (`pg_export_snapshot` + `--snapshot`). Também copia os arquivos do Storage. Tudo é cifrado com `age`, usando só a chave pública na VPS, e enviado com `rclone`. Por último, roda `rclone check`, grava um manifesto sem dado pessoal e pinga o monitor externo (`/start`, sucesso e `/fail`).
    - Antes de começar, o script compara o `system_identifier` do cluster com a configuração e aborta se não bater, porque há outro stack Supabase na VPS.
    - Ele também recusa uma chave privada no arquivo de destinatários.
  - `restore-drill`: roda só numa VM descartável. Ele se recusa a rodar sem `ELOLAB_DRILL_CONFIRM=VM_DESCARTAVEL`, no hostname da produção ou se o container de produção existir na máquina.
    - Baixa o backup, confere o `SHA256SUMS`, decifra e sobe `supabase/postgres` com a mesma tag do manifesto e `--network none`.
    - Restaura, desativa o `pg_cron`, compara contagens e md5 e conta os arquivos do Storage.
    - Grava um relatório com o tempo de cada etapa (RTO medido) e sai com código 2 se houver divergência.
  - `status`: roda fora da VPS e falha se o último backup no bucket tiver mais de 26 h.
  - `pitr-check`: roda na VPS a cada 5 min. Lê o `pg_stat_archiver` e alerta se ficar mais de 10 min sem arquivar WAL ou se houver falha.
- **`docs/operations/backup-e-restauracao.md` (novo)** cobre:
  - a situação atual, com evidência;
  - os alvos: RPO ≤ 5 min com PITR, ≤ 24 h só com o dump, e RTO ≤ 4 h;
  - a arquitetura: a VPS só cifra, não apaga, e o alerta mora fora dela;
  - quatro decisões do responsável;
  - preparação de chaves (age e PGP), bucket com Object Lock, credenciais e monitor;
  - instalação e cron;
  - **PITR com WAL-G**, que já vem na imagem `supabase/postgres`: wrapper, `ALTER SYSTEM`, base diária, retenção feita fora da VPS e restauração para um instante escolhido;
  - o ensaio mensal e o seu relatório;
  - o roteiro de desastre com orçamento de tempo dentro de 4 h;
  - a tabela de alertas externos e os riscos.
- **`docs/operations/ci-banco-efemero.md` (novo)** traz:
  - o problema, com evidência;
  - a proposta do job `security-e2e`: `supabase start` no runner, migrations do zero, seed sintético, checagem de grants `SECURITY DEFINER`/anon, as três specs, falha em skip e `db lint --local` no lugar do `--linked` com o projeto Cloud;
  - os bloqueios B1 a B8, com dono;
  - um rascunho de YAML, custo de tempo, aceite e ordem.
  - Está alinhado com a seção 6 de `docs/qa/plano-regressao-rodada-1.md`: mesmo nome de job, mesmos scripts e CLIN-QA-563 a 566.

## Arquivos tocados
- `scripts/ops/backup-offsite.sh` (novo)
- `docs/operations/backup-e-restauracao.md` (novo)
- `docs/operations/ci-banco-efemero.md` (novo)
- `docs/time/rodada-1/devops-sre.md` (novo)

## Evidências (comandos executados e resultado real)
- `bash -n scripts/ops/backup-offsite.sh` → sem erro de sintaxe.
- ShellCheck 0.10.0 (binário oficial baixado no scratchpad) `-S warning` → código 0, nenhum aviso. Nível `style`: restam só infos SC2016 e SC2086, intencionais (crase literal no Markdown e divisão de palavras em `$COUNT_SCHEMAS`).
- `bash backup-offsite.sh --help` → imprime o cabeçalho de uso, código 0.
- `backup` e `restore-drill` sem dependências nesta máquina → abortam antes de qualquer ação com "comandos ausentes: docker age rclone", código 1. Isso confirma que as checagens prévias rodam primeiro.
- `grep -c $'\r'` no script → 0, ou seja, LF.
- Geração do SQL de contagem e checksum impressa e revisada. O primeiro rascunho do checksum quebraria com tabela ausente, porque o `CASE` com subconsulta é resolvido no parse; corrigi com `query_to_xml`.
- Fontes consultadas (27/10): a documentação do WAL-G, que diz que o push com PGP só precisa da chave pública, e o repositório `supabase/postgres`. Nele, `Dockerfile-17:129-139` instala o WAL-G com `archive_command` comentado chamando `admin-mgr`, e o `pg_hba.conf.j2` libera `supabase_admin` no socket local. Também o `docker-compose.yml` oficial (`supabase/postgres:17.6.1.136`, Storage `file` em `./volumes/storage`) e a referência da CLI do Supabase (`start -x`, `status -o env --override-name`, `db lint --local --fail-on`).
- `ls supabase/migrations | awk -F_ '{print $1}' | sort | uniq -d` → `20261010198000`.

## NÃO VERIFICADO
- O script nunca rodou contra um Postgres real: aqui não há Docker nem psql (`command -v docker psql` vazio). O mecanismo do snapshot por FIFO e os erros esperados do `pg_restore` na imagem Supabase precisam do primeiro ensaio.
- Na VPS: a versão do Postgres, a presença do `wal-g` na imagem instalada, o `pg_hba`, o backend do Storage, o nome do container e os backups do Easypanel.
- Se a CLI do Supabase de fato rejeita a versão de migration duplicada, e se as 454 migrations aplicam a partir do zero.
- O comportamento do Object Lock quando o WAL é reenviado (`WALG_PREVENT_WAL_OVERWRITE`).

## Riscos
- **P0 continua aberto (CLIN-QA-005)** até existir o primeiro backup off-site e um ensaio aprovado. Até o PITR entrar, o RPO real é de 24 h, e é isso que deve constar em proposta e contrato.
- Com o arquivamento de WAL ligado, uma falha no bucket retém WAL e pode encher o disco. O `pitr-check` alerta em 10 min; falta o runbook de disco cheio.
- O ensaio trata dado real de saúde fora da produção, e a região do bucket pode configurar transferência internacional: **requer avaliação especializada** (DPO).
- Não há `.gitattributes`, e com `core.autocrlf=true` o `.sh` pode sair com CRLF no Windows. Proposta: `*.sh text eol=lf`.

## Próximo dono
- **Responsável:** decisões D1 a D4 (provedor e região do bucket, monitor, custódia das chaves, VM de ensaio), criação do bucket e das credenciais, e autorização para instalar o `backup` na VPS e rodar o primeiro `restore-drill`.
- **database-engineer:** B1/CLIN-QA-563 e B2 (`db reset` local do zero); fixar `[db] major_version` depois da leitura na VPS.
- **qa-engineer:** `seed-duas-clinicas.mjs`, `falhar-se-pulado.mjs` e as asserções (CLIN-QA-565 e 566).
- **tech-lead:** B8/CLIN-QA-564 (modo de teste do Vite).
- **devops-sre (próxima rodada, se autorizado a editar `.github/`):** job `security-e2e` informativo; corrigir o comentário de `test.yml:93-97`; runbooks de disco cheio, incidente e rotação de segredos; uptime externo e status page (CLIN-QA-015).
