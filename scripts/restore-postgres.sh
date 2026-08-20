#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_FILE:?Defina BACKUP_FILE com o .dump.age}"
: "${AGE_KEY_FILE:?Defina AGE_KEY_FILE com a chave privada age}"
: "${RESTORE_DATABASE_URL:?Defina RESTORE_DATABASE_URL para uma base isolada}"

test -f "$BACKUP_FILE"
test -f "$BACKUP_FILE.sha256"
sha256sum -c "$BACKUP_FILE.sha256"
umask 077
dump_file="$(mktemp --suffix=.dump)"
trap 'rm -f "$dump_file"' EXIT
age -d -i "$AGE_KEY_FILE" -o "$dump_file" "$BACKUP_FILE"
pg_restore --exit-on-error --no-owner --clean --if-exists --dbname="$RESTORE_DATABASE_URL" "$dump_file"
printf 'Restore concluído em banco isolado. Execute as verificações de contagem e health antes de aprovar.\n'
