#!/usr/bin/env sh
# DB 백업: deploy/backups/zoo-YYYYmmdd-HHMM.sql.gz, 14일 지난 것은 삭제
# crontab 예: 30 4 * * * cd /home/ubuntu/zero-or-one/deploy && ./backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")"
mkdir -p backups
f="backups/zoo-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T db pg_dump -U zoo -d zoo | gzip > "$f"
find backups -name 'zoo-*.sql.gz' -mtime +14 -delete
echo "backup ok: $f"
