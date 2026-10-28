# Backup off-site, restauração e PITR

Dono: DevOps/SRE. Versão 1 em 27/10/2026, rodada 1 do time. Itens do backlog: CLIN-QA-005 (P0), 308 e 309. Ações 7.5 e 90.3 do diagnóstico.

Este documento é uma proposta pronta para o responsável executar. Nada aqui foi aplicado na VPS, no Easypanel, no bucket ou no DNS. Quando um passo depende do estado real da VPS, ele está marcado como **NÃO VERIFICADO** e começa com uma checagem.

Script: `scripts/ops/backup-offsite.sh` (subcomandos `backup`, `restore-drill`, `status` e `pitr-check`).

## 1. Situação atual

| Item | Estado | Evidência |
|---|---|---|
| Backup de banco | `auto-backup` copia buckets do Storage para o bucket `backups` **da mesma instância** | `supabase/functions/auto-backup/index.ts:131-170` |
| Backup fora da VPS | nenhum no repositório | — |
| Backups do Easypanel | **NÃO VERIFICADO** (o diagnóstico não teve acesso ao painel) | `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md:149` |
| Restauração testada | nunca executada | `DIAGNOSTICO_16_FUNCOES.md:125` |
| PITR | inexistente; o self-hosted não traz PITR gerenciado | `docs/EASYPANEL-VPS.md:32-36` |
| Outro stack Supabase na mesma VPS | sim: todo comando precisa identificar o banco do EloLab | `docs/EASYPANEL-VPS.md:20-23` |

Consequência: se a VPS for perdida, o dado clínico de todas as clínicas é perdido de forma irreversível (P0 latente).

## 2. Objetivos

| Métrica | Alvo inicial | Como é garantido | Como é medido |
|---|---|---|---|
| **RPO** (perda máxima de dados) | **≤ 5 min** | WAL contínuo com `archive_timeout = 60` (seção 7) | `pitr-check` a cada 5 min; alerta acima de 10 min sem WAL arquivado |
| RPO só com o dump lógico (até o PITR entrar) | ≤ 24 h | dump diário | `status` fora da VPS; alerta acima de 26 h |
| **RTO** (tempo até voltar) | **≤ 4 h** | roteiro da seção 9 com imagens fixadas e chaves no cofre | ensaio mensal cronometrado (seção 8) |
| Retenção | 35 dias diários + 12 mensais | regras de ciclo de vida do bucket | listagem do bucket no ensaio |
| Imutabilidade | 14 dias | bloqueio de objetos no bucket | tentativa de apagar com a chave da VPS falha |

O RPO de 5 minutos só vale depois do PITR. Até lá, o compromisso real é de 24 horas e é isso que deve constar em contrato e proposta.

## 3. Arquitetura

```
VPS (Easypanel)                                   Fora da VPS
┌────────────────────────────────────┐
│ elolab_supabase / container db     │  wal-push (PGP, chave pública)
│   archive_command ─────────────────┼──────────────────────────► bucket/pitr/   (WAL + base diária)
│                                    │
│ cron 03:15 UTC: backup-offsite.sh  │  pg_dump | age (chave pública)
│   backup ──────────────────────────┼──────────────────────────► bucket/logical/ (dump, roles, storage)
│ cron */5: pitr-check ──────────────┼──── ping ───► Healthchecks ──► e-mail / Telegram do responsável
└────────────────────────────────────┘                  ▲
                                                         │ ping
Máquina de operação (fora da VPS)                        │
  cron horário: backup-offsite.sh status ────────────────┘   (chave somente leitura)
  mensal: VM descartável ← restore-drill (chave privada só durante o ensaio)
```

Princípios:

1. **A VPS só cifra.** Ela guarda só as chaves públicas (age e PGP). Quem invade a VPS não lê os backups antigos.
2. **A VPS não apaga.** A remoção é feita pelo ciclo de vida do bucket, e o bloqueio de objetos impede apagar ou sobrescrever durante 14 dias. Um ransomware na VPS não destrói o histórico.
3. **O alerta mora fora da VPS.** O monitor é do tipo "dead man's switch": se a VPS cair, o ping deixa de chegar e o alerta dispara do mesmo jeito.
4. **Banco identificado pelo cluster.** O script compara o `system_identifier` do Postgres com `ELOLAB_DB_SYSTEM_ID` e aborta se não bater. Isso evita fazer backup do outro stack Supabase da VPS por engano de nome.

## 4. Decisões que dependem do responsável

| # | Decisão | Recomendação | Observação |
|---|---|---|---|
| D1 | Provedor e região do bucket | **AWS S3 `sa-east-1` (São Paulo) com Object Lock**, ou Cloudflare R2 com bucket lock | Dado de saúde fora do Brasil é transferência internacional: **requer avaliação especializada** (DPO). O S3 em São Paulo evita a questão; o R2 é mais barato e já é da stack habitual. Preço: consultar a página oficial de cada um (**NÃO VERIFICADO**) |
| D2 | Monitor externo | Healthchecks.io (plano gratuito cobre 20 checks) ou Better Stack (heartbeat) | Precisa avisar por canal que não dependa da VPS nem do e-mail `@elolab.com.br` servido pela mesma infraestrutura |
| D3 | Custódia das chaves privadas | Duas pessoas, cada uma com cópia no cofre de senhas; mais uma cópia impressa em envelope lacrado | Sem a chave privada, o backup é inútil. Sem duas pessoas, a perda de um notebook vira perda de dados |
| D4 | Onde roda o ensaio | VM descartável na nuvem do bucket (mesma região), criada e destruída a cada ensaio | O ensaio manipula dado real de paciente: disco cifrado, sem IP público de entrada e destruição registrada |

## 5. Preparação (fora da VPS)

Executar uma vez, numa máquina de operação confiável.

### 5.1 Chaves

```bash
# age: backup lógico
age-keygen -o elolab-backup-age.key           # PRIVADA: vai para o cofre, nunca para a VPS
age-keygen -y elolab-backup-age.key > recipients.txt   # pública
# Recomendado: uma segunda chave, guardada pela segunda pessoa, como destinatário extra.
age-keygen -o elolab-backup-age-2.key && age-keygen -y elolab-backup-age-2.key >> recipients.txt

# PGP: WAL-G (o push só precisa da pública)
gpg --quick-generate-key "EloLab WAL-G <ops@exemplo.invalid>" rsa4096 encrypt never
gpg --armor --export  <ID> > walg-public.asc     # vai para a VPS
gpg --armor --export-secret-keys <ID> > walg-private.asc   # cofre
```

Depois de guardar no cofre, apague os arquivos privados da máquina de operação.

### 5.2 Bucket

1. Criar o bucket `elolab-backups` (nome a definir) com bloqueio de objetos ligado na criação. No S3, Object Lock só pode ser ligado na criação do bucket.
2. Retenção padrão de 14 dias (modo governance no S3, ou regra de bucket lock no R2).
3. Ciclo de vida: `logical/` expira em 35 dias; `logical-monthly/` em 400 dias; `pitr/` em 15 dias (a retenção do PITR também é feita pelo `wal-g delete`, ver 7.4).
4. Três credenciais, cada uma restrita ao bucket:

| Credencial | Onde fica | Permissões |
|---|---|---|
| `vps-escrita` | VPS | gravar e ler objetos, listar. Sem `DeleteObject` quando o provedor permitir (S3: política IAM; no R2 o token "Object Read & Write" inclui exclusão, e quem protege é o bucket lock) |
| `monitor-leitura` | máquina de operação | ler e listar |
| `admin-retencao` | cofre | apagar; usada só para `wal-g delete` e manutenção |

Detalhes de política IAM e de bucket lock mudam com frequência: confirme na documentação oficial do provedor no dia da configuração.

### 5.3 Monitor externo

Criar quatro checks no Healthchecks (ou equivalente):

| Check | Período | Tolerância | Quem pinga |
|---|---|---|---|
| `elolab-backup-diario` | 1 dia | 2 h | `backup` na VPS (`/start`, sucesso, `/fail`) |
| `elolab-backup-no-bucket` | 1 h | 1 h | `status` na máquina de operação |
| `elolab-pitr` | 5 min | 10 min | `pitr-check` na VPS |
| `elolab-ensaio-mensal` | 31 dias | 3 dias | ping manual ao fim de cada ensaio aprovado |

Notificação por e-mail pessoal e Telegram (ou SMS) do responsável e do suplente. A URL de ping é um segredo leve: fica só no arquivo de configuração.

## 6. Backup lógico diário (VPS)

### 6.1 Checagens antes de instalar (somente leitura)

```bash
# Qual é o container do banco do EloLab? Há outro stack Supabase na VPS.
docker ps --format '{{.Names}}\t{{.Image}}' | grep -i postgres
# Confirmar que é o EloLab e anotar o identificador do cluster:
docker exec -i <container> psql -U supabase_admin -d postgres -qAt \
  -c "SELECT system_identifier FROM pg_control_system();" \
  -c "SELECT to_regclass('public.clinicas') IS NOT NULL;"
# Onde está o volume do Storage (backend de arquivo)?
docker inspect <container-storage> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
# Espaço livre
df -h /var
```

O `docker-compose.yml` oficial monta o Storage em `./volumes/storage:/var/lib/storage` e usa `STORAGE_BACKEND: file`. Se o Easypanel configurou o Storage com S3, o passo 4 do backup não se aplica e o bucket do Storage precisa de replicação própria. **NÃO VERIFICADO**.

O `pg_hba.conf` da imagem `supabase/postgres` confia em `supabase_admin` pelo socket local. Se a versão instalada exigir senha, defina `PGPASSWORD` no arquivo de configuração. **NÃO VERIFICADO** na VPS.

### 6.2 Instalação

```bash
apt-get install -y age rclone            # ou binário oficial do rclone, versão fixada
install -d -m 700 /etc/elolab-backup /var/backups/elolab /var/log/elolab-backup
install -m 700 scripts/ops/backup-offsite.sh /usr/local/sbin/elolab-backup-offsite
install -m 600 recipients.txt /etc/elolab-backup/recipients.txt
rclone config --config /etc/elolab-backup/rclone.conf   # remote "elolab-bkp" com a credencial vps-escrita
chmod 600 /etc/elolab-backup/rclone.conf
```

O Git usa `core.autocrlf=true` e o repositório não tem `.gitattributes`. Antes de copiar o script para a VPS, confira que ele está com LF (`file backup-offsite.sh` não pode dizer "CRLF").

`/etc/elolab-backup/backup.env` (modo 600):

```bash
ELOLAB_DB_CONTAINER=<nome exato do container db do EloLab>
ELOLAB_DB_SYSTEM_ID=<system_identifier anotado em 6.1>
ELOLAB_STORAGE_DIR=<caminho no host do volume do Storage>
RCLONE_CONFIG=/etc/elolab-backup/rclone.conf
RCLONE_REMOTE=elolab-bkp:elolab-backups
AGE_RECIPIENTS_FILE=/etc/elolab-backup/recipients.txt
REMOTE_MONTHLY_PREFIX=logical-monthly
HC_BACKUP_PING_URL=https://hc-ping.com/<uuid>
HC_PITR_PING_URL=https://hc-ping.com/<uuid>
MIN_FREE_GB=10
# Opcionais: DB_SUPERUSER, DB_NAME, CHECKSUM_TABLES, COUNT_SCHEMAS, PGPASSWORD
```

Cron (`/etc/cron.d/elolab-backup`):

```cron
15 3 * * * root /usr/local/sbin/elolab-backup-offsite backup >/dev/null 2>&1
*/5 * * * * root /usr/local/sbin/elolab-backup-offsite pitr-check >/dev/null 2>&1
```

Ative o `pitr-check` só depois da seção 7. Antes disso, ele dispara alerta, porque `archive_mode` está desligado.

### 6.3 O que cada execução grava

`<remote>/logical/AAAA/MM/DD/elolab-<carimbo UTC>/`:

| Arquivo | Conteúdo | Cifrado |
|---|---|---|
| `roles.sql.age` | `pg_dumpall --roles-only` (inclui hashes de senha) | sim |
| `db.dump.age` | `pg_dump --format=custom` do banco `postgres` (public, auth, storage, cron etc.) | sim |
| `contagens.tsv.age` | contagem de todas as tabelas de `public`, `auth` e `storage` e md5 de 6 tabelas clínicas | sim |
| `storage.tar.gz.age` | arquivos do volume do Storage | sim |
| `SHA256SUMS` | hash dos arquivos cifrados | não |
| `manifest.json` | carimbo, versão do Postgres, imagem, tamanhos, hashes e número de arquivos | não, e sem dado pessoal |

Contagens, checksums e `pg_dump` usam o **mesmo snapshot** (`pg_export_snapshot` + `pg_dump --snapshot`), então o ensaio pode exigir igualdade exata. O Storage é copiado logo depois e pode divergir alguns segundos do banco.

Não vão para o bucket: o `.env` do Compose, JWT secret, chaves do Mercado Pago, da Brevo e da Evolution. Eles ficam no cofre e são necessários na seção 9.

### 6.4 Primeira execução

```bash
/usr/local/sbin/elolab-backup-offsite backup && tail -n 20 /var/log/elolab-backup/backup-*.log
```

Aceite: o check `elolab-backup-diario` fica verde; o `status` na máquina de operação acha o backup; o ensaio da seção 8 é aprovado.

## 7. PITR com WAL-G

### 7.1 Por que WAL-G

A imagem oficial `supabase/postgres` já instala o WAL-G e traz um `wal-g.conf` com `archive_command` e `restore_command` comentados (`Dockerfile-17:129-139` e `ansible/files/postgresql_config/custom_walg.conf` no repositório `supabase/postgres`, consultados em 27/10/2026). O pgBackRest exigiria imagem própria. O WAL-G aceita cifrar com chave **pública** PGP no `wal-push` e no `backup-push`; a privada só é necessária no `wal-fetch` e no `backup-fetch` (documentação do WAL-G, seção de criptografia).

Os comandos comentados na imagem chamam `/usr/bin/admin-mgr`, ferramenta da plataforma gerenciada que pode não existir no self-hosted. Por isso a proposta usa um wrapper próprio.

### 7.2 Checagens (somente leitura)

```bash
docker exec <db> sh -c 'command -v wal-g && wal-g --version'
docker exec <db> psql -U supabase_admin -d postgres -qAt \
  -c "SHOW server_version" -c "SHOW archive_mode" -c "SHOW wal_level" -c "SHOW data_directory"
docker inspect <db> --format '{{.Config.Image}}'
```

Se o `wal-g` não existir na versão instalada, fixe uma imagem `supabase/postgres` que o tenha, na mesma versão maior, em janela própria.

### 7.3 Configuração (em janela de manutenção, com backup lógico aprovado antes)

1. Arquivos novos num volume montado só para isso, por exemplo `./volumes/walg:/etc/walg:ro`, pertencendo ao usuário `postgres` do container:

   `/etc/walg/walg.env` (600):

   ```bash
   WALG_S3_PREFIX=s3://elolab-backups/pitr
   AWS_ACCESS_KEY_ID=<credencial vps-escrita>
   AWS_SECRET_ACCESS_KEY=<credencial vps-escrita>
   AWS_REGION=sa-east-1                      # R2: auto
   # AWS_ENDPOINT=https://<conta>.r2.cloudflarestorage.com   # só para R2/S3 compatível
   WALG_PGP_KEY_PATH=/etc/walg/walg-public.asc
   WALG_COMPRESSION_METHOD=zstd
   WALG_PREVENT_WAL_OVERWRITE=true
   PGHOST=/var/run/postgresql
   PGUSER=supabase_admin
   ```

   `/etc/walg/wal-push.sh` (755):

   ```sh
   #!/bin/sh
   set -a; . /etc/walg/walg.env; set +a
   exec wal-g wal-push "$1"
   ```

   `WALG_PREVENT_WAL_OVERWRITE=true` é importante com bloqueio de objetos: se o Postgres repetir o envio de um segmento já gravado, o WAL-G confere o arquivo existente em vez de tentar sobrescrever. Teste esse comportamento no staging antes da produção.

2. Parâmetros (persistem em `postgresql.auto.conf`, dentro do volume de dados):

   ```sql
   ALTER SYSTEM SET archive_mode = 'on';
   ALTER SYSTEM SET archive_command = '/etc/walg/wal-push.sh %p';
   ALTER SYSTEM SET archive_timeout = '60';   -- garante segmento a cada 60 s mesmo com pouco tráfego
   ```

   `wal_level` precisa ser `replica` ou `logical` (a imagem usa `logical`). `archive_mode` exige reinício do container.

3. Base backup diário e retenção:

   ```cron
   # VPS, depois do dump lógico
   45 3 * * * root docker exec <db> sh -c 'set -a; . /etc/walg/walg.env; set +a; wal-g backup-push "$(psql -qAt -c "SHOW data_directory")"'
   ```

   ```bash
   # Máquina de operação, semanal, com a credencial admin-retencao
   wal-g delete retain FULL 14 --confirm
   ```

4. Verificação:

   ```bash
   docker exec <db> psql -U supabase_admin -d postgres -qAt -c "SELECT * FROM pg_stat_archiver;"
   docker exec <db> sh -c 'set -a; . /etc/walg/walg.env; set +a; wal-g backup-list; wal-g wal-verify integrity timeline'
   ```

   Ligue o `pitr-check` no cron.

Riscos do arquivamento:

- Se o `archive_command` falhar, o Postgres **retém o WAL no disco** até conseguir enviar. Uma queda do bucket vira disco cheio. O `pitr-check` alerta em 10 minutos; o runbook de disco cheio precisa tratar esse caso.
- O volume de WAL com `archive_timeout = 60` é de até 1.440 segmentos por dia (16 MB antes da compressão; segmentos quase vazios comprimem muito). Meça no staging antes de fixar a retenção.

### 7.4 Restauração para um instante escolhido

Na VM de ensaio ou no servidor de recuperação, nunca sobre o volume da produção:

```bash
# 1. Base backup anterior ao instante
wal-g backup-fetch /restore/pgdata LATEST          # ou o nome do backup anterior ao alvo
# 2. Recuperação (PostgreSQL 12+)
touch /restore/pgdata/recovery.signal
cat >> /restore/pgdata/postgresql.auto.conf <<'CONF'
restore_command = 'wal-g wal-fetch %f %p'
recovery_target_time = '2026-11-03 14:25:00-03'
recovery_target_action = 'promote'
archive_mode = 'off'
CONF
# 3. Subir a MESMA imagem supabase/postgres com esse PGDATA, sem rede, e conferir
```

O ambiente precisa da chave PGP **privada** (`WALG_PGP_KEY_PATH`) e da credencial `monitor-leitura`. Aceite (90.3): restauração num instante escolhido, com uma linha sintética gravada antes do alvo presente e uma gravada depois ausente.

## 8. Ensaio de restauração (mensal)

Frequência: lógico todo mês; PITR a cada trimestre e depois de qualquer mudança de versão do Postgres ou da imagem.

1. Criar a VM descartável: Ubuntu LTS, disco cifrado, 2 vCPU, RAM e disco de pelo menos 3 vezes o tamanho do dump, sem portas de entrada além de SSH restrito por IP. Instalar `docker`, `age` e `rclone`.
2. Copiar para a VM: o script, um `drill.env` com a credencial `monitor-leitura` e, só durante o ensaio, a chave privada age do cofre.

   ```bash
   RCLONE_CONFIG=/root/drill/rclone.conf
   RCLONE_REMOTE=elolab-bkp:elolab-backups
   AGE_IDENTITY_FILE=/root/drill/elolab-backup-age.key
   DRILL_REPORT_DIR=/root/drill/relatorios
   ELOLAB_PROD_HOSTNAME=<hostname da VPS>
   ELOLAB_DB_CONTAINER=<nome do container de produção>   # o ensaio recusa rodar se ele existir
   # DRILL_BACKUP_PATH=2026/11/03/elolab-20261103T031500Z  # opcional; padrão = o mais recente
   ```

3. Rodar:

   ```bash
   ELOLAB_BACKUP_CONFIG=/root/drill/drill.env ELOLAB_DRILL_CONFIRM=VM_DESCARTAVEL \
     bash backup-offsite.sh restore-drill
   ```

   O script baixa, confere o `SHA256SUMS`, decifra, sobe `supabase/postgres` com a mesma tag do manifesto e `--network none`, restaura roles e dump, desativa os jobs do `pg_cron`, compara contagens e md5 com os do backup, extrai o Storage e conta os arquivos. O relatório `restauracao-<carimbo>.md` traz o tempo de cada etapa. Ele sai com código 2 se houver divergência.

4. Na primeira execução, revise os erros do `pg_restore` no log. A imagem já cria schemas e extensões do Supabase, e o `--clean --if-exists` pode gerar erros esperados sobre objetos de extensão. Liste-os no relatório como "esperados" uma vez e trate qualquer erro novo como falha. **NÃO VERIFICADO**: o script nunca foi executado contra um backup real.
5. Copiar o relatório para `docs/operations/restauracoes/AAAA-MM-DD.md`, acrescentando:
   - quem executou e quando;
   - tempo para subir o stack completo (Auth, PostgREST, Storage) e fazer login com um usuário sintético, se medido;
   - lista de erros esperados do `pg_restore`;
   - confirmação da destruição da VM e da remoção da chave privada.
6. Destruir a VM e pingar `elolab-ensaio-mensal`.

O relatório não pode conter dado de paciente. O script grava só nomes de tabela, contagens, hashes e tempos.

LGPD: o ensaio trata dado real de saúde fora da produção. Base legal, registro da operação e prazo de destruição **requerem avaliação especializada** (DPO). Até lá, use o ambiente mais restrito disponível e registre cada ensaio.

## 9. Recuperação de desastre (VPS perdida)

Orçamento de tempo para cumprir RTO ≤ 4 h. Os tempos são **estimativas** até o primeiro ensaio completo.

| Passo | Ação | Estimativa |
|---|---|---|
| 1 | Declarar incidente, congelar mudanças, avisar clínicas pela status page | 15 min |
| 2 | Criar VPS nova (mesmo porte), firewall só 22/80/443, instalar Easypanel | 30 min |
| 3 | Criar o Compose do Supabase com a **mesma release** e a mesma tag `supabase/postgres`; restaurar o `.env` do cofre (JWT secret, chaves) para que as chaves anon e service continuem válidas | 30 min |
| 4 | Restaurar o banco: PITR até o último WAL (7.4) ou, sem PITR, o último dump (seção 8, apontando para o volume real) | 30-60 min |
| 5 | Restaurar o Storage (`storage.tar.gz`) no volume | 15 min |
| 6 | Copiar `supabase/functions`, configurar os secrets das Edge Functions do cofre, reiniciar | 20 min |
| 7 | Frontend: App do Easypanel com o mesmo build | 15 min |
| 8 | DNS de `api` e `app` para o novo IP (TTL baixo definido antes) | 5-30 min |
| 9 | Validação: `/healthz`, login, agenda do dia, prontuário, portal, webhook do Mercado Pago em sandbox; reativar crons | 30 min |

Pré-requisitos que precisam existir **antes** do desastre: `.env` e secrets no cofre; release do Supabase e tag da imagem anotadas; TTL do DNS em 300 s; duas pessoas com acesso ao cofre, ao provedor da VPS, ao bucket e ao DNS.

## 10. Alertas externos

| Alerta | Origem | Condição | Ação |
|---|---|---|---|
| Backup diário não chegou | Healthchecks `elolab-backup-diario` | sem ping em 26 h ou `/fail` | ler o log em `/var/log/elolab-backup/`; repetir o backup |
| Bucket sem backup novo | `status` fora da VPS | último diretório com mais de 26 h | confirma que o problema não é só o ping |
| WAL atrasado | `pitr-check` | `archive_mode` desligado, nada arquivado há mais de 10 min ou falha mais recente que o último sucesso | ver `pg_stat_archiver`, credencial e espaço; risco de disco cheio |
| Ensaio vencido | `elolab-ensaio-mensal` | 34 dias sem ensaio aprovado | agendar ensaio |
| VPS ou API fora | uptime externo (Better Stack/UptimeRobot) em `https://app.elolab.com.br/healthz` e `https://api.elolab.com.br/auth/v1/health` | 2 falhas seguidas | runbook de incidente (a escrever) |

O uptime e a status page fazem parte do item de observabilidade (CLIN-QA-015) e ainda não foram configurados.

## 11. Pendências e riscos

| Item | Situação |
|---|---|
| Script nunca executado contra um banco real | **NÃO VERIFICADO**. Validado só com `bash -n` e ShellCheck 0.10.0. A primeira execução deve ser no staging ou numa cópia |
| Snapshot por FIFO no `backup` | depende de o `psql` liberar a saída a cada consulta; se travar, o `read -t` aborta com erro e o ping `/fail` dispara |
| Erros esperados do `pg_restore` sobre a imagem Supabase | a listar no primeiro ensaio |
| Storage com backend S3 em vez de arquivo | **NÃO VERIFICADO**; muda o passo 4 do backup |
| Bloqueio de objetos × reenvio de WAL | testar `WALG_PREVENT_WAL_OVERWRITE` no staging |
| Região do bucket e ensaio com dado real | requerem avaliação especializada (DPO) |
| `auto-backup` na mesma VPS | pode continuar como cópia local rápida, mas não conta como backup. Desligar depois do primeiro ensaio aprovado, por decisão do responsável |
| `.gitattributes` ausente | o script pode sair do Git com CRLF no Windows; proposta: `*.sh text eol=lf` (fora do escopo desta tarefa) |

## 12. Referências consultadas em 27/10/2026

- WAL-G, armazenamento S3: https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md
- WAL-G, criptografia e compressão: https://github.com/wal-g/wal-g/blob/master/docs/README.md
- WAL-G para PostgreSQL: https://github.com/wal-g/wal-g/blob/master/docs/PostgreSQL.md
- Imagem `supabase/postgres` (`Dockerfile-17`, `custom_walg.conf`, `pg_hba.conf.j2`): https://github.com/supabase/postgres
- Compose oficial do Supabase (`docker/docker-compose.yml`, imagem `supabase/postgres:17.6.1.136`, Storage em `./volumes/storage`): https://github.com/supabase/supabase/tree/master/docker
- Self-hosting com Docker: https://supabase.com/docs/guides/self-hosting/docker
- PostgreSQL, arquivamento contínuo e PITR: https://www.postgresql.org/docs/current/continuous-archiving.html
