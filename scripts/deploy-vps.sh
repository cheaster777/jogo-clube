#!/usr/bin/env bash
set -Eeuo pipefail

release_dir="${1:?Uso: deploy-vps.sh RELEASE_DIR RELEASE_SHA ENV_FILE HEALTH_URL}"
release_sha="${2:?Uso: deploy-vps.sh RELEASE_DIR RELEASE_SHA ENV_FILE HEALTH_URL}"
env_file="${3:?Uso: deploy-vps.sh RELEASE_DIR RELEASE_SHA ENV_FILE HEALTH_URL}"
health_url="${4:?Uso: deploy-vps.sh RELEASE_DIR RELEASE_SHA ENV_FILE HEALTH_URL}"
health_url="${health_url%/}"

if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'SHA de release inválido: %s\n' "$release_sha" >&2
  exit 2
fi

case "$release_dir" in
  "$HOME"/jogo-clube-releases/"$release_sha") ;;
  *)
    printf 'Diretório de release fora da raiz permitida: %s\n' "$release_dir" >&2
    exit 2
    ;;
esac

if [[ ! -r "$env_file" ]]; then
  printf 'Arquivo de ambiente não encontrado ou sem leitura: %s\n' "$env_file" >&2
  exit 2
fi

for required_file in docker-compose.yml Dockerfile Caddyfile package.json; do
  if [[ ! -f "$release_dir/$required_file" ]]; then
    printf 'Release incompleta: falta %s\n' "$required_file" >&2
    exit 2
  fi
done

compose() {
  docker compose \
    --project-directory "$release_dir" \
    --env-file "$env_file" \
    --profile backend \
    "$@"
}

http_ready() {
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --max-time 8 "$health_url/health/ready" >/dev/null
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget --quiet --timeout=8 --output-document=/dev/null "$health_url/health/ready"
    return
  fi

  printf 'A VPS precisa de curl ou wget para executar o health check.\n' >&2
  return 1
}

wait_until_ready() {
  local _
  for _ in $(seq 1 30); do
    if http_ready; then
      return 0
    fi
    sleep 3
  done
  return 1
}

tag_running_image() {
  local service="$1"
  local target_tag="$2"
  local container_id image_id

  container_id="$(compose ps -q "$service" 2>/dev/null || true)"
  [[ -n "$container_id" ]] || return 1

  image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
  [[ -n "$image_id" ]] || return 1

  docker image tag "$image_id" "$target_tag"
}

compose config --quiet

# A implantação nunca começa sem tentar preservar o banco atual. Quando o
# serviço ainda não existe (primeiro deploy), não há dados anteriores a salvar.
db_container="$(compose ps -q db 2>/dev/null || true)"
if [[ -n "$db_container" ]] && [[ "$(docker inspect --format '{{.State.Running}}' "$db_container")" == 'true' ]]; then
  backup_dir="$HOME/backups"
  backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_file="$backup_dir/jogo-clube-predeploy-${backup_stamp}-${release_sha:0:12}.dump"
  umask 077
  mkdir -p "$backup_dir"
  docker exec "$db_container" sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' \
    > "$backup_file"
  test -s "$backup_file"
  sha256sum "$backup_file" > "$backup_file.sha256"
  printf 'Backup pré-deploy criado: %s\n' "$backup_file"
else
  printf 'Banco ainda não está em execução; backup pré-deploy não aplicável.\n'
fi

rollback_ready=false
if tag_running_image web 'jogo-clube-frontend:rollback' \
  && tag_running_image api 'jogo-clube-api:rollback'; then
  rollback_ready=true
fi

rollback() {
  if [[ "$rollback_ready" != 'true' ]]; then
    printf 'Não havia imagens anteriores disponíveis para rollback.\n' >&2
    return 1
  fi

  printf 'Restaurando imagens anteriores...\n' >&2
  export FRONTEND_IMAGE='jogo-clube-frontend:rollback'
  export API_IMAGE='jogo-clube-api:rollback'
  compose up -d --no-build --remove-orphans
  if wait_until_ready; then
    printf 'Rollback concluído e ambiente saudável.\n' >&2
    return 0
  fi

  printf 'ATENÇÃO: o rollback também não passou no health check.\n' >&2
  return 1
}

export FRONTEND_IMAGE="jogo-clube-frontend:${release_sha}"
export API_IMAGE="jogo-clube-api:${release_sha}"

printf 'Construindo imagens da release %s...\n' "$release_sha"
compose build --pull web api
if ! compose up -d --no-build --remove-orphans; then
  printf 'O Docker Compose não conseguiu aplicar a release %s.\n' "$release_sha" >&2
  rollback || true
  exit 1
fi

if ! wait_until_ready; then
  printf 'Release %s falhou no health check.\n' "$release_sha" >&2
  compose logs --since=10m api web >&2 || true
  rollback || true
  exit 1
fi

docker image tag "$FRONTEND_IMAGE" 'jogo-clube-frontend:stable'
docker image tag "$API_IMAGE" 'jogo-clube-api:stable'
ln -sfn "$release_dir" "$HOME/jogo-clube-current"

compose ps
printf 'Release %s implantada com sucesso.\n' "$release_sha"
