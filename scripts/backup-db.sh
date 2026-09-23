#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
output="backups/gm-tributario-$stamp.dump"
docker compose exec -T db pg_dump -U diagnostico -d diagnostico -Fc > "$output.tmp"
mv "$output.tmp" "$output"
printf 'Backup criado: %s\n' "$output"
