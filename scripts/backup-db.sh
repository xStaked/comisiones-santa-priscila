#!/usr/bin/env bash
# ============================================================
# Dinacuamar — PostgreSQL Backup Script
# ============================================================
# Uso:
#   chmod +x scripts/backup-db.sh
#   ./scripts/backup-db.sh
#
# Requiere:
#   - Docker y docker-compose en ejecución
#   - Contenedor postgres con nombre "dinacuamar-postgres"
#
# Salida:
#   - backups/dinacuamar_YYYY-MM-DD_HH-MM-SS.sql.gz
# ============================================================

set -euo pipefail

# Configuración
CONTAINER_NAME="dinacuamar-postgres"
DB_NAME="${POSTGRES_DB:-dinacuamar}"
DB_USER="${POSTGRES_USER:-dinacuamar}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Timestamp para el nombre de archivo
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/dinacuamar_${TIMESTAMP}.sql"

# Verificar que el contenedor está corriendo
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: El contenedor '${CONTAINER_NAME}' no está en ejecución."
    exit 1
fi

echo "Iniciando backup de la base de datos '${DB_NAME}'..."

# Ejecutar pg_dump dentro del contenedor y guardar localmente
docker exec -t "$CONTAINER_NAME" pg_dump \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    > "$BACKUP_FILE"

# Comprimir con gzip
echo "Comprimiendo backup..."
gzip "$BACKUP_FILE"

BACKUP_FILE_GZ="${BACKUP_FILE}.gz"
BACKUP_SIZE=$(du -h "$BACKUP_FILE_GZ" | cut -f1)

echo "Backup completado: $BACKUP_FILE_GZ"
echo "Tamaño: $BACKUP_SIZE"

# Eliminar backups antiguos según retención configurada
echo "Limpiando backups con más de ${RETENTION_DAYS} días..."
find "$BACKUP_DIR" -type f -name "dinacuamar_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Backup finalizado con éxito."
