#!/bin/sh

if [ -z "$1" ]; then
  echo "Usage: $0 <timestamp>"
  exit 1
fi

TIMESTAMP="$1"
BACKUP_DIR="/backups"
DB_BACKUP_FILE="$BACKUP_DIR/db_$TIMESTAMP.sql"
DATA_BACKUP_FILE="$BACKUP_DIR/data_$TIMESTAMP.tar.gz"

if [ ! -f "$DB_BACKUP_FILE" ]; then
  echo "Error: Database backup file not found: $DB_BACKUP_FILE"
  exit 1
fi

if [ ! -f "$DATA_BACKUP_FILE" ]; then
  echo "Error: Data backup file not found: $DATA_BACKUP_FILE"
  exit 1
fi

echo "Starting restore for timestamp $TIMESTAMP..."

# Stop EspoCRM to prevent writes during restore
echo "Stopping EspoCRM container..."
docker stop suitecrm-espocrm-1

# Restore Database
echo "Restoring database..."
docker exec -i suitecrm-db-1 mysql -u espocrm -pstrongpassword espocrm < "$DB_BACKUP_FILE"

# Restore Data Volume
echo "Restoring data volume..."
# Clean existing data first (optional, but safer for full restore)
docker run --rm --volumes-from suitecrm-espocrm-1 alpine sh -c "rm -rf /var/www/html/*"
# Untar backup
docker run --rm --volumes-from suitecrm-espocrm-1 -v "$BACKUP_DIR":/backup alpine tar xzf "/backup/data_$TIMESTAMP.tar.gz" -C /var/www/html

# Restart EspoCRM
echo "Restarting EspoCRM container..."
docker start suitecrm-espocrm-1

echo "Restore completed successfully."
