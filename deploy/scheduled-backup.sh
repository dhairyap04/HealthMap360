#!/bin/sh
# Install through the hosting operator; this script is not scheduled automatically.
set -eu
umask 077
if [ "$#" -ne 1 ]; then
    echo "Usage: scheduled-backup.sh /restricted/operator-owned-backup.env" >&2
    exit 2
fi
set -a
. "$1"
set +a
: "${HEALTHMAP_REPOSITORY:?Set the absolute repository directory}"
: "${HEALTHMAP_PYTHON:?Set the application Python executable}"
: "${HEALTHMAP_BACKUP_DIRECTORY:?Set a restricted backup directory}"
: "${DATABASE_URL:?Set the intended application database}"
: "${SECRET_KEY:?Set the persistent application signing key}"
mkdir -p "$HEALTHMAP_BACKUP_DIRECTORY"
backup_stamp=$(date -u +%Y%m%dT%H%M%SZ)
PYTHONPATH="$HEALTHMAP_REPOSITORY/backend" "$HEALTHMAP_PYTHON" -m app.operations backup --file "$HEALTHMAP_BACKUP_DIRECTORY/healthmap-$backup_stamp.backup"
