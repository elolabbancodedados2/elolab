#!/usr/bin/env bash
# EloLab: backup lógico off-site criptografado, ensaio de restauração e checagens.
#
# Documentação: docs/operations/backup-e-restauracao.md (leia antes de rodar).
#
# Subcomandos
#   backup          Na VPS (cron diário). pg_dump + roles + arquivos do Storage,
#                   criptografados com age (só chave PÚBLICA na VPS) e enviados
#                   com rclone para o bucket externo.
#   restore-drill   Numa VM DESCARTÁVEL, nunca na VPS. Baixa o último backup (ou
#                   o indicado), decifra com a chave PRIVADA, restaura num
#                   container supabase/postgres isolado, confere checksums e
#                   contagens e grava um relatório com os tempos (RTO medido).
#   status          Fora da VPS (monitor externo). Falha se o backup mais
#                   recente no bucket for mais velho que MAX_BACKUP_AGE_HOURS.
#   pitr-check      Na VPS (cron a cada 5 min). Lê pg_stat_archiver e avisa o
#                   monitor externo se o arquivamento de WAL atrasar ou falhar.
#
# Configuração: arquivo de variáveis (padrão /etc/elolab-backup/backup.env,
# root:root 0600), ou ELOLAB_BACKUP_CONFIG=/caminho. Nenhum segredo fica neste
# script. Variáveis em docs/operations/backup-e-restauracao.md, seção 5.
#
# Requisitos: bash >= 4, docker, age, rclone, curl, sha256sum, flock, tar, gzip.

set -Eeuo pipefail
umask 077

readonly SCRIPT_NAME="backup-offsite"
readonly SCRIPT_VERSION="1.0.0"

CONFIG_FILE="${ELOLAB_BACKUP_CONFIG:-/etc/elolab-backup/backup.env}"
LOG_FILE=""
WORKDIR=""

# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

ts_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
now_s() { date -u +%s; }

log() {
  local line
  line="$(ts_utc) [$SCRIPT_NAME] $*"
  printf '%s\n' "$line" >&2
  if [[ -n "$LOG_FILE" ]]; then printf '%s\n' "$line" >>"$LOG_FILE"; fi
}

die() { log "ERRO: $*"; exit 1; }

require_cmds() {
  local c missing=()
  for c in "$@"; do command -v "$c" >/dev/null 2>&1 || missing+=("$c"); done
  ((${#missing[@]} == 0)) || die "comandos ausentes: ${missing[*]}"
}

require_vars() {
  local v
  for v in "$@"; do [[ -n "${!v:-}" ]] || die "variável obrigatória não definida: $v"; done
}

load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    # O arquivo de configuração contém caminhos e URLs de ping, não senhas.
    # Exige-se 0600 para que ninguém além do dono altere o que será executado.
    local perms
    perms="$(stat -c '%a' "$CONFIG_FILE" 2>/dev/null || echo '?')"
    [[ "$perms" == "600" || "$perms" == "400" ]] || die "permissão de $CONFIG_FILE deve ser 600 (atual: $perms)"
    set -a
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    set +a
  else
    log "aviso: $CONFIG_FILE não encontrado; usando só o ambiente"
  fi

  # Padrões
  BACKUP_WORKDIR="${BACKUP_WORKDIR:-/var/backups/elolab}"
  BACKUP_LOG_DIR="${BACKUP_LOG_DIR:-/var/log/elolab-backup}"
  MIN_FREE_GB="${MIN_FREE_GB:-10}"
  MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-26}"
  PITR_MAX_LAG_MIN="${PITR_MAX_LAG_MIN:-10}"
  DB_SUPERUSER="${DB_SUPERUSER:-supabase_admin}"
  DB_NAME="${DB_NAME:-postgres}"
  CHECKSUM_TABLES="${CHECKSUM_TABLES:-public.clinicas public.pacientes public.prontuarios public.prescricoes public.agendamentos public.lancamentos}"
  COUNT_SCHEMAS="${COUNT_SCHEMAS:-public auth storage}"
  REMOTE_PREFIX="${REMOTE_PREFIX:-logical}"
  RCLONE_FLAGS="${RCLONE_FLAGS:---retries 5 --low-level-retries 10 --s3-no-check-bucket}"
}

# Ping do monitor externo (Healthchecks.io ou compatível): <url>, <url>/start, <url>/fail.
# O corpo enviado contém só as últimas linhas do log deste script, que não tem segredos.
hc_ping() {
  local url="$1" suffix="${2:-}" body="${3:-}"
  [[ -n "$url" ]] || return 0
  curl -fsS -m 15 --retry 3 -o /dev/null --data-raw "$body" "${url}${suffix}" || log "aviso: ping ao monitor falhou (${suffix:-ok})"
}

cleanup_workdir() {
  if [[ -n "$WORKDIR" && -d "$WORKDIR" && "$WORKDIR" == "$BACKUP_WORKDIR"/* ]]; then
    rm -rf -- "$WORKDIR"
  fi
}

free_gb() { df -Pk "$1" | awk 'NR==2 {printf "%d", $4/1024/1024}'; }

# psql dentro do container do banco, pelo socket local (sem senha na linha de comando).
# Se a imagem exigir senha, defina PGPASSWORD no arquivo de configuração.
db_psql() {
  docker exec -i ${PGPASSWORD:+-e PGPASSWORD} "$ELOLAB_DB_CONTAINER" \
    psql -X -v ON_ERROR_STOP=1 -U "$DB_SUPERUSER" -d "$DB_NAME" -qAt "$@"
}

# Consulta que gera, para cada tabela base dos schemas pedidos, "schema.tabela<TAB>contagem".
count_sql() {
  local schemas_sql
  schemas_sql="$(printf "'%s'," $COUNT_SCHEMAS)"; schemas_sql="${schemas_sql%,}"
  cat <<SQL
SELECT format('%s.%s', table_schema, table_name) || E'\t' ||
       (xpath('/row/c/text()', query_to_xml(
          format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
  FROM information_schema.tables
 WHERE table_schema IN ($schemas_sql) AND table_type = 'BASE TABLE'
 ORDER BY 1;
SQL
}

# Checksum independente da ordem física: md5 da concatenação ordenada dos md5 das linhas.
checksum_sql() {
  local t schema name
  for t in $CHECKSUM_TABLES; do
    schema="${t%%.*}"; name="${t#*.}"
    # query_to_xml só é avaliada no ELSE: tabela ausente não quebra a consulta.
    cat <<SQL
SELECT 'md5:$t' || E'\t' || CASE WHEN to_regclass('$schema.$name') IS NULL THEN 'ausente'
       ELSE (xpath('/row/h/text()', query_to_xml(format(
         'SELECT md5(coalesce(string_agg(h, %L ORDER BY h), %L)) AS h FROM (SELECT md5(x::text) AS h FROM %I.%I x) s',
         '', '', '$schema', '$name'), false, true, '')))[1]::text END;
SQL
  done
}

# ---------------------------------------------------------------------------
# backup
# ---------------------------------------------------------------------------

cmd_backup() {
  require_cmds docker age rclone curl sha256sum flock tar gzip df stat
  require_vars ELOLAB_DB_CONTAINER ELOLAB_DB_SYSTEM_ID ELOLAB_STORAGE_DIR RCLONE_REMOTE AGE_RECIPIENTS_FILE
  [[ -f "$AGE_RECIPIENTS_FILE" ]] || die "AGE_RECIPIENTS_FILE não existe"
  if grep -q 'AGE-SECRET-KEY' "$AGE_RECIPIENTS_FILE"; then
    die "AGE_RECIPIENTS_FILE contém chave PRIVADA; na VPS só pode haver chave pública"
  fi

  mkdir -p "$BACKUP_WORKDIR" "$BACKUP_LOG_DIR"
  exec 9>"$BACKUP_WORKDIR/.lock"
  flock -n 9 || die "outro backup em andamento"

  local stamp t_start
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  t_start="$(now_s)"
  LOG_FILE="$BACKUP_LOG_DIR/backup-$stamp.log"
  WORKDIR="$BACKUP_WORKDIR/run-$stamp"
  mkdir -p "$WORKDIR"
  # shellcheck disable=SC2154  # rc é atribuído dentro do próprio trap
  trap 'rc=$?; if ((rc != 0)); then hc_ping "${HC_BACKUP_PING_URL:-}" /fail "$(tail -n 30 "$LOG_FILE" 2>/dev/null)"; fi; cleanup_workdir; exit $rc' EXIT

  hc_ping "${HC_BACKUP_PING_URL:-}" /start
  log "início do backup $stamp (script $SCRIPT_VERSION)"

  # 1. Pré-checagens -------------------------------------------------------
  local free
  free="$(free_gb "$BACKUP_WORKDIR")"
  ((free >= MIN_FREE_GB)) || die "espaço livre em $BACKUP_WORKDIR: ${free} GB (< ${MIN_FREE_GB} GB)"

  [[ "$(docker inspect -f '{{.State.Running}}' "$ELOLAB_DB_CONTAINER" 2>/dev/null)" == "true" ]] \
    || die "container $ELOLAB_DB_CONTAINER não está rodando"

  # Há outro stack Supabase na mesma VPS: confirmar que é o banco do EloLab pelo
  # identificador do cluster, não pelo nome do container.
  local sysid
  sysid="$(db_psql -c 'SELECT system_identifier FROM pg_control_system();')"
  [[ "$sysid" == "$ELOLAB_DB_SYSTEM_ID" ]] \
    || die "system_identifier do container ($sysid) difere de ELOLAB_DB_SYSTEM_ID; container errado?"
  [[ "$(db_psql -c "SELECT to_regclass('public.clinicas') IS NOT NULL;")" == "t" ]] \
    || die "public.clinicas não existe neste banco; container errado?"

  [[ -d "$ELOLAB_STORAGE_DIR" ]] || die "ELOLAB_STORAGE_DIR não existe: $ELOLAB_STORAGE_DIR"

  local pg_version image
  pg_version="$(db_psql -c 'SHOW server_version;')"
  image="$(docker inspect -f '{{.Config.Image}}' "$ELOLAB_DB_CONTAINER")"
  log "banco ok: postgres $pg_version, imagem $image"

  # 2. Roles (globais) -----------------------------------------------------
  # Contém hashes de senha das roles: sai do container direto para o age.
  docker exec -i ${PGPASSWORD:+-e PGPASSWORD} "$ELOLAB_DB_CONTAINER" \
    pg_dumpall -U "$DB_SUPERUSER" --roles-only \
    | age -R "$AGE_RECIPIENTS_FILE" -o "$WORKDIR/roles.sql.age"
  log "roles exportadas"

  # 3. Snapshot exportado: contagens, checksums e pg_dump veem o MESMO estado --
  local fifo_in fifo_out snapshot line
  fifo_in="$WORKDIR/.psql_in"; fifo_out="$WORKDIR/.psql_out"
  mkfifo "$fifo_in" "$fifo_out"
  docker exec -i ${PGPASSWORD:+-e PGPASSWORD} "$ELOLAB_DB_CONTAINER" \
    psql -X -v ON_ERROR_STOP=1 -U "$DB_SUPERUSER" -d "$DB_NAME" -qAt <"$fifo_in" >"$fifo_out" 2>>"$LOG_FILE" &
  local psql_pid=$!
  exec 7>"$fifo_in" 8<"$fifo_out"

  printf '%s\n' "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" "SELECT pg_export_snapshot();" >&7
  # Ignora qualquer linha de status que a versão do psql imprima antes do resultado.
  snapshot=""
  while IFS= read -r -t 60 line <&8; do
    if [[ "$line" =~ ^[0-9A-F]+-[0-9A-F]+-[0-9]+$ ]]; then snapshot="$line"; break; fi
  done
  [[ -n "$snapshot" ]] || die "não foi possível exportar o snapshot"
  log "snapshot exportado: $snapshot"

  # Contagens e checksums na mesma transação (vão criptografados: são dados de negócio).
  { count_sql; checksum_sql; printf '%s\n' "SELECT '__FIM__';"; } >&7
  : >"$WORKDIR/contagens.tsv"
  while IFS= read -r -t 3600 line <&8; do
    [[ "$line" == "__FIM__" ]] && break
    printf '%s\n' "$line" >>"$WORKDIR/contagens.tsv"
  done
  [[ "$line" == "__FIM__" ]] || die "contagens incompletas"
  log "contagens: $(wc -l <"$WORKDIR/contagens.tsv") linhas"

  # pg_dump usando o snapshot aberto acima (a transação continua aberta no fifo).
  docker exec -i ${PGPASSWORD:+-e PGPASSWORD} "$ELOLAB_DB_CONTAINER" \
    pg_dump -U "$DB_SUPERUSER" -d "$DB_NAME" --format=custom --compress=6 \
      --snapshot="$snapshot" --no-sync \
    | age -R "$AGE_RECIPIENTS_FILE" -o "$WORKDIR/db.dump.age"
  log "pg_dump concluído: $(du -h "$WORKDIR/db.dump.age" | cut -f1)"

  printf '%s\n' "COMMIT;" "\\q" >&7
  exec 7>&- 8<&-
  wait "$psql_pid" || die "sessão do snapshot terminou com erro"
  rm -f "$fifo_in" "$fifo_out"

  age -R "$AGE_RECIPIENTS_FILE" -o "$WORKDIR/contagens.tsv.age" "$WORKDIR/contagens.tsv"
  rm -f "$WORKDIR/contagens.tsv"

  # 4. Arquivos do Storage -------------------------------------------------
  # Cópia de arquivos do volume; pode divergir em segundos do snapshot do banco.
  local storage_files
  storage_files="$(find "$ELOLAB_STORAGE_DIR" -type f | wc -l)"
  tar -C "$ELOLAB_STORAGE_DIR" -cf - . | gzip -6 \
    | age -R "$AGE_RECIPIENTS_FILE" -o "$WORKDIR/storage.tar.gz.age"
  log "storage: $storage_files arquivos"

  # 5. Manifesto (sem dados pessoais) e checksums ---------------------------
  (cd "$WORKDIR" && sha256sum roles.sql.age db.dump.age contagens.tsv.age storage.tar.gz.age >SHA256SUMS)
  cat >"$WORKDIR/manifest.json" <<JSON
{
  "stamp": "$stamp",
  "created_at": "$(ts_utc)",
  "script_version": "$SCRIPT_VERSION",
  "host": "$(hostname -s)",
  "postgres_version": "$pg_version",
  "db_image": "$image",
  "db_system_identifier": "$sysid",
  "db_name": "$DB_NAME",
  "storage_file_count": $storage_files,
  "files": {
$(cd "$WORKDIR" && for f in roles.sql.age db.dump.age contagens.tsv.age storage.tar.gz.age; do
    printf '    "%s": {"bytes": %s, "sha256": "%s"},\n' "$f" "$(stat -c %s "$f")" "$(sha256sum "$f" | cut -d' ' -f1)"
  done | sed '$ s/,$//')
  }
}
JSON

  # 6. Envio ---------------------------------------------------------------
  local dest
  dest="$RCLONE_REMOTE/$REMOTE_PREFIX/${stamp:0:4}/${stamp:4:2}/${stamp:6:2}/elolab-$stamp"
  # shellcheck disable=SC2086
  rclone copy $RCLONE_FLAGS --exclude '.*' "$WORKDIR" "$dest"
  # Confere o que chegou (tamanho e hash quando o provedor expõe).
  # shellcheck disable=SC2086
  rclone check $RCLONE_FLAGS --one-way --exclude '.*' "$WORKDIR" "$dest"
  # Marcador do "último backup" é o próprio manifesto: o status lê o prefixo mais recente.
  log "enviado para $dest"

  # Cópia mensal (dia 01) em prefixo de retenção longa; cópia no servidor, sem reenviar.
  if [[ "${stamp:6:2}" == "01" && -n "${REMOTE_MONTHLY_PREFIX:-}" ]]; then
    # shellcheck disable=SC2086
    rclone copy $RCLONE_FLAGS "$dest" "$RCLONE_REMOTE/$REMOTE_MONTHLY_PREFIX/${stamp:0:6}/elolab-$stamp"
    log "cópia mensal gravada"
  fi

  local dur=$(( $(now_s) - t_start ))
  log "backup concluído em ${dur}s"
  hc_ping "${HC_BACKUP_PING_URL:-}" "" "backup $stamp ok em ${dur}s; storage $storage_files arquivos"
}

# ---------------------------------------------------------------------------
# status (rodar FORA da VPS, com chave de leitura)
# ---------------------------------------------------------------------------

latest_remote_dir() {
  # Diretórios elolab-<stamp> ordenam lexicograficamente por data.
  rclone lsf --dirs-only -R --max-depth 4 "$RCLONE_REMOTE/$REMOTE_PREFIX" 2>/dev/null \
    | grep -E 'elolab-[0-9]{8}T[0-9]{6}Z/$' | sort | tail -n 1 | sed 's:/$::'
}

cmd_status() {
  require_cmds rclone curl date
  require_vars RCLONE_REMOTE
  local latest stamp age_h epoch
  latest="$(latest_remote_dir)"
  if [[ -z "$latest" ]]; then
    hc_ping "${HC_STATUS_PING_URL:-}" /fail "nenhum backup encontrado"
    die "nenhum backup encontrado em $RCLONE_REMOTE/$REMOTE_PREFIX"
  fi
  rclone lsf "$RCLONE_REMOTE/$REMOTE_PREFIX/$latest/manifest.json" >/dev/null 2>&1 \
    || { hc_ping "${HC_STATUS_PING_URL:-}" /fail "último backup sem manifesto: $latest"; die "último backup sem manifesto: $latest"; }
  stamp="${latest##*elolab-}"
  epoch="$(date -u -d "${stamp:0:4}-${stamp:4:2}-${stamp:6:2}T${stamp:9:2}:${stamp:11:2}:${stamp:13:2}Z" +%s)"
  age_h=$(( ($(now_s) - epoch) / 3600 ))
  if ((age_h > MAX_BACKUP_AGE_HOURS)); then
    hc_ping "${HC_STATUS_PING_URL:-}" /fail "último backup há ${age_h}h: $latest"
    die "último backup há ${age_h}h (limite ${MAX_BACKUP_AGE_HOURS}h): $latest"
  fi
  log "último backup: $latest (${age_h}h)"
  hc_ping "${HC_STATUS_PING_URL:-}" "" "último backup há ${age_h}h"
}

# ---------------------------------------------------------------------------
# pitr-check (na VPS, a cada 5 min, depois de ligar o WAL-G)
# ---------------------------------------------------------------------------

cmd_pitr_check() {
  require_cmds docker curl
  require_vars ELOLAB_DB_CONTAINER ELOLAB_DB_SYSTEM_ID HC_PITR_PING_URL
  local sysid row mode last_age failed_after
  sysid="$(db_psql -c 'SELECT system_identifier FROM pg_control_system();')"
  [[ "$sysid" == "$ELOLAB_DB_SYSTEM_ID" ]] || die "container errado (system_identifier $sysid)"

  row="$(db_psql -F '|' -c "
    SELECT current_setting('archive_mode'),
           coalesce(extract(epoch FROM now() - last_archived_time)::int, -1),
           (last_failed_time IS NOT NULL AND (last_archived_time IS NULL OR last_failed_time > last_archived_time))
      FROM pg_stat_archiver;")"
  IFS='|' read -r mode last_age failed_after <<<"$row"

  local msg="archive_mode=$mode; último WAL arquivado há ${last_age}s; falha recente=$failed_after"
  # archive_timeout=60 força troca de segmento; sem arquivamento recente, o RPO de 5 min está em risco.
  if [[ "$mode" != "on" && "$mode" != "always" ]] || ((last_age < 0 || last_age > PITR_MAX_LAG_MIN * 60)) || [[ "$failed_after" == "t" ]]; then
    hc_ping "$HC_PITR_PING_URL" /fail "$msg"
    die "$msg"
  fi
  hc_ping "$HC_PITR_PING_URL" "" "$msg"
}

# ---------------------------------------------------------------------------
# restore-drill (somente em VM descartável)
# ---------------------------------------------------------------------------

cmd_restore_drill() {
  require_cmds docker age rclone sha256sum tar gzip awk diff
  require_vars RCLONE_REMOTE AGE_IDENTITY_FILE DRILL_REPORT_DIR
  [[ "${ELOLAB_DRILL_CONFIRM:-}" == "VM_DESCARTAVEL" ]] \
    || die "defina ELOLAB_DRILL_CONFIRM=VM_DESCARTAVEL para confirmar que esta máquina é descartável"
  if [[ -n "${ELOLAB_PROD_HOSTNAME:-}" && "$(hostname -s)" == "$ELOLAB_PROD_HOSTNAME" ]]; then
    die "recusado: este host é a produção"
  fi
  if [[ -n "${ELOLAB_DB_CONTAINER:-}" ]] && docker inspect "$ELOLAB_DB_CONTAINER" >/dev/null 2>&1; then
    die "recusado: o container de produção $ELOLAB_DB_CONTAINER existe nesta máquina"
  fi
  [[ -f "$AGE_IDENTITY_FILE" ]] || die "AGE_IDENTITY_FILE não existe"

  local drill_name="elolab-drill-db"
  docker inspect "$drill_name" >/dev/null 2>&1 && die "container $drill_name já existe; remova antes"

  BACKUP_WORKDIR="${DRILL_WORKDIR:-/var/tmp/elolab-drill}"
  mkdir -p "$BACKUP_WORKDIR" "$DRILL_REPORT_DIR"
  local run_stamp
  run_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  WORKDIR="$BACKUP_WORKDIR/drill-$run_stamp"
  LOG_FILE="$DRILL_REPORT_DIR/drill-$run_stamp.log"
  mkdir -p "$WORKDIR"
  trap 'rc=$?; docker rm -f '"$drill_name"' >/dev/null 2>&1 || true; cleanup_workdir; exit $rc' EXIT

  local T0 T1 T2 T3 T4 T5
  T0="$(now_s)"
  log "ensaio de restauração iniciado"

  # 1. Download --------------------------------------------------------------
  local src="${DRILL_BACKUP_PATH:-}"
  [[ -n "$src" ]] || src="$(latest_remote_dir)"
  [[ -n "$src" ]] || die "nenhum backup encontrado"
  # shellcheck disable=SC2086
  rclone copy $RCLONE_FLAGS "$RCLONE_REMOTE/$REMOTE_PREFIX/$src" "$WORKDIR/in"
  (cd "$WORKDIR/in" && sha256sum -c SHA256SUMS) >>"$LOG_FILE" 2>&1 || die "SHA256SUMS não confere"
  T1="$(now_s)"
  log "download e checksums ok: $src"

  local image
  image="$(sed -n 's/.*"db_image": *"\([^"]*\)".*/\1/p' "$WORKDIR/in/manifest.json")"
  [[ -n "$image" ]] || die "manifesto sem db_image"
  [[ "$image" == supabase/postgres:* ]] || die "imagem inesperada no manifesto: $image"

  # 2. Decifrar -------------------------------------------------------------
  # Os arquivos decifrados contêm dados reais de pacientes: VM com disco
  # criptografado, sem acesso público e destruída ao fim (ver documentação).
  local f
  for f in roles.sql db.dump contagens.tsv storage.tar.gz; do
    age -d -i "$AGE_IDENTITY_FILE" -o "$WORKDIR/$f" "$WORKDIR/in/$f.age"
  done
  # O usuário do container precisa ler os arquivos montados em /drill. A VM é
  # descartável e de uso exclusivo do ensaio; por isso a leitura é liberada aqui.
  chmod 755 "$WORKDIR"
  chmod 644 "$WORKDIR/roles.sql" "$WORKDIR/db.dump"
  T2="$(now_s)"
  log "arquivos decifrados"

  # 3. Restaurar ---------------------------------------------------------------
  # Container sem rede: nada sai da VM e nenhum job (pg_cron, pg_net) alcança a internet.
  local pgpass
  pgpass="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
  docker run -d --name "$drill_name" --network none \
    -e POSTGRES_PASSWORD="$pgpass" \
    -v "$WORKDIR:/drill:ro" \
    "$image" >/dev/null
  local _
  for _ in $(seq 1 120); do
    docker exec "$drill_name" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break
    sleep 2
  done
  docker exec "$drill_name" pg_isready -U postgres -h localhost >/dev/null 2>&1 || die "postgres do ensaio não subiu"
  # A imagem roda scripts de init depois do primeiro "ready"; aguarda estabilizar.
  sleep 15

  # Roles: a imagem já cria as roles do Supabase; "already exists" é esperado.
  docker exec "$drill_name" psql -X -U "$DB_SUPERUSER" -d postgres -f /drill/roles.sql >>"$LOG_FILE" 2>&1 || true
  local restore_rc=0
  docker exec "$drill_name" pg_restore -U "$DB_SUPERUSER" -d postgres --clean --if-exists \
    --jobs "${DRILL_RESTORE_JOBS:-4}" /drill/db.dump >>"$LOG_FILE" 2>&1 || restore_rc=$?
  local restore_errors
  restore_errors="$(grep -c 'pg_restore: error' "$LOG_FILE" || true)"
  # Os jobs do pg_cron vêm no dump. Desativá-los logo após a restauração evita
  # que alterem tabelas durante a verificação (o container já está sem rede).
  # Se a divergência aparecer só em tabelas escritas por cron, repita a verificação.
  docker exec "$drill_name" psql -X -U "$DB_SUPERUSER" -d postgres \
    -c "UPDATE cron.job SET active = false;" >>"$LOG_FILE" 2>&1 || true
  T3="$(now_s)"
  log "pg_restore terminou (rc=$restore_rc, erros registrados=$restore_errors)"

  # 4. Verificar ----------------------------------------------------------------
  local ELOLAB_DB_CONTAINER="$drill_name"
  db_psql <<<"$(count_sql; checksum_sql)" >"$WORKDIR/contagens-restauradas.tsv"
  local diverg=0
  if ! diff -u "$WORKDIR/contagens.tsv" "$WORKDIR/contagens-restauradas.tsv" >"$WORKDIR/diff.txt"; then
    diverg="$(grep -cE '^[-+][^-+]' "$WORKDIR/diff.txt" || true)"
  fi
  mkdir -p "$WORKDIR/storage"
  tar -C "$WORKDIR/storage" -xzf "$WORKDIR/storage.tar.gz"
  local storage_files storage_expected
  storage_files="$(find "$WORKDIR/storage" -type f | wc -l)"
  storage_expected="$(sed -n 's/.*"storage_file_count": *\([0-9]*\).*/\1/p' "$WORKDIR/in/manifest.json")"
  T4="$(now_s)"

  # 5. Relatório (sem dados pessoais: só nomes de tabela, contagens e tempos) --
  local status="APROVADO"
  if ((diverg > 0)) || [[ "$storage_files" != "$storage_expected" ]]; then status="REPROVADO"; fi
  local report="$DRILL_REPORT_DIR/restauracao-$run_stamp.md"
  T5="$(now_s)"
  {
    printf '# Ensaio de restauração %s\n\n' "$run_stamp"
    printf -- '- Resultado: **%s**\n' "$status"
    printf -- '- Backup restaurado: `%s`\n' "$src"
    printf -- '- Imagem: `%s`\n' "$image"
    printf -- '- Host do ensaio: `%s`\n' "$(hostname -s)"
    printf -- '- Script: %s\n\n' "$SCRIPT_VERSION"
    printf '| Etapa | Segundos |\n|---|---|\n'
    printf '| Download e checksums | %s |\n' $((T1 - T0))
    printf '| Decifrar | %s |\n' $((T2 - T1))
    printf '| Subir Postgres e pg_restore | %s |\n' $((T3 - T2))
    printf '| Verificação | %s |\n' $((T4 - T3))
    printf '| **Total (RTO do banco, medido)** | **%s** |\n\n' $((T5 - T0))
    printf -- '- Linhas divergentes (contagens/checksums): %s\n' "$diverg"
    printf -- '- Erros do pg_restore: %s (rc=%s). Revise o log; erros de objetos da própria imagem são esperados e precisam ser listados.\n' "$restore_errors" "$restore_rc"
    printf -- '- Arquivos do Storage: %s restaurados de %s esperados\n' "$storage_files" "$storage_expected"
    printf '\nNão medido aqui: subir o stack completo (Auth, PostgREST, Storage, Edge), DNS e validação funcional. Ver o roteiro de recuperação de desastre.\n'
    if ((diverg > 0)); then printf '\n## Divergências\n\n```diff\n'; cat "$WORKDIR/diff.txt"; printf '```\n'; fi
  } >"$report"
  log "relatório: $report ($status, total $((T5 - T0))s)"
  [[ "$status" == "APROVADO" ]] || exit 2
}

# ---------------------------------------------------------------------------

usage() {
  awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
  exit "${1:-0}"
}

main() {
  local cmd="${1:-}"
  [[ -n "$cmd" ]] || usage 1
  case "$cmd" in
    -h|--help|help) usage 0 ;;
  esac
  load_config
  case "$cmd" in
    backup)        cmd_backup ;;
    status)        cmd_status ;;
    pitr-check)    cmd_pitr_check ;;
    restore-drill) cmd_restore_drill ;;
    *) usage 1 ;;
  esac
}

main "$@"
