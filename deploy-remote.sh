#!/bin/bash
set -e

# Configuration
RESIDENT_UI_DEST="/home/ubuntu/resident-ui"
BACKUP_DIR="/var/www/html/resident-ui-backup"

# Clear existing files in the resident-ui directory
echo "Clearing existing files..."
rm -rf "$RESIDENT_UI_DEST"/*

# Extract deployment package directly to the symbolic link location
echo "Extracting deployment package..."
tar -xzf resident-ui-deploy.tar.gz -C "$RESIDENT_UI_DEST" --strip-components=0

# Set proper permissions
echo "Setting permissions..."
sudo chown -R www-data:www-data "$RESIDENT_UI_DEST"
sudo chmod -R 755 "$RESIDENT_UI_DEST"

echo "Deployment completed successfully!"
