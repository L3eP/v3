#!/bin/bash
# ============================================================
# Database Backup Script — MAYUNG Ticketing System
# Usage:
#   ./scripts/backup-db.sh                    # backup sekarang
#   ./scripts/backup-db.sh /path/to/backups   # backup ke direktori custom
#
# Setup cron untuk backup harian (3AM):
#   0 3 * * * /path/to/project/scripts/backup-db.sh
#
# Retensi: 30 hari (file backup otomatis dihapus setelah 30 hari)
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(grep -v '^\s*#' "$PROJECT_DIR/.env" | xargs)
fi

# Konfigurasi
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-login_app_db}"
BACKUP_DIR="${1:-$PROJECT_DIR/backup/db}"
RETENTION_DAYS=30

# Buat direktori backup jika belum ada
mkdir -p "$BACKUP_DIR"

# Nama file: db_nama_tanggal.sql.gz
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
FILENAME="db_${DB_NAME}_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "📦 Backing up database: $DB_NAME"
echo "   → $FILEPATH"

# Backup dengan mysqldump, kompres dengan gzip
if [ -z "$DB_PASSWORD" ]; then
    mysqldump -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" | gzip > "$FILEPATH"
else
    mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" | gzip > "$FILEPATH"
fi

# Verifikasi
if [ -f "$FILEPATH" ]; then
    FILESIZE=$(du -h "$FILEPATH" | cut -f1)
    echo "✅ Backup berhasil: $FILESIZE"
else
    echo "❌ Backup gagal!"
    exit 1
fi

# Hapus backup lebih dari 30 hari
find "$BACKUP_DIR" -name "db_${DB_NAME}_*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

echo "🗑️  Backup lebih dari $RETENTION_DAYS hari otomatis dihapus"
echo "✅ Selesai"
