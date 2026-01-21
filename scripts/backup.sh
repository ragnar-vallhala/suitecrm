#!/bin/bash

BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
DB_BACKUP_FILE="$BACKUP_DIR/db_$TIMESTAMP.sql"
DATA_BACKUP_FILE="$BACKUP_DIR/data_$TIMESTAMP.tar.gz"

echo "Starting backup at $TIMESTAMP..."

# Backup Database
echo "Backing up database..."
docker exec suitecrm-db-1 mysqldump -u espocrm -pstrongpassword espocrm > "$DB_BACKUP_FILE"

# Backup Data Volume
# We use a helper container to mount the volume and tar it to the backup dir
echo "Backing up data volume..."
docker run --rm --volumes-from suitecrm-espocrm-1 -v "$BACKUP_DIR":/backup alpine tar czf "/backup/data_$TIMESTAMP.tar.gz" -C /var/www/html .

echo "Backup completed: $DB_BACKUP_FILE and $DATA_BACKUP_FILE"

# Retention: Delete backups older than 7 days
find "$BACKUP_DIR" -type f -name "*.sql" -mtime +7 -delete
find "$BACKUP_DIR" -type f -name "*.tar.gz" -mtime +7 -delete
