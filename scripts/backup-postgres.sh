#!/usr/bin/env bash
set -euo pipefail

: "${COMPOSE_ENV_FILE:?Defina COMPOSE_ENV_FILE com o caminho do .env.production}"
: "${BACKUP_AGE_RECIPIENT:?Defina o destinatário age do backup}"
: "${BACKUP_DIR:?Defina o diretório de backups}"
: "${POSTGRES_USER:?Defina POSTGRES_USER}"
: "${POSTGRES_DB:?Defina POSTGRES_DB}"

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$BACKUP_DIR/jogo-clube-$stamp.dump.age"

docker compose --env-file "$COMPOSE_ENV_FILE" --profile backend exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$archive"

sha256sum "$archive" > "$archive.sha256"
printf 'Backup criado: %s\n' "$archive"
