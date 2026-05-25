#!/bin/sh
set -e

cd /app

echo "==> Corriendo migraciones de Alembic..."
alembic upgrade head

echo "==> Iniciando servidor..."
# Si no hay argumentos, usa el default de producción.
# En desarrollo docker-compose puede pasar 'uvicorn app.main:app --reload'
if [ $# -eq 0 ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
else
    exec "$@"
fi
