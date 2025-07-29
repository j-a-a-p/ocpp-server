#!/bin/bash

# Simple Resident UI Deployment Script
# This script builds the React app and copies it to the server

set -e

# Function to cleanup files on exit
cleanup() {
    echo "Cleaning up local files..."
    rm -f "$DEPLOY_PACKAGE" deploy-remote.sh 2>/dev/null || true
}

# Set trap to cleanup on script exit (success or failure)
trap cleanup EXIT

echo "Starting Resident UI deployment..."

# SSH Configuration
SSH_KEY="../ChargeAPT.pem"
SSH_USER="ubuntu"
SSH_HOST="apt.aircokopen.nu"  # Will be prompted if not provided

# Server Configuration
RESIDENT_UI_DEST="/var/www/html/resident-ui"

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "ERROR: SSH key file '$SSH_KEY' not found in current directory"
    echo "Please ensure the PEM file is in the same directory as this script"
    exit 1
fi

echo "Found SSH key: $SSH_KEY"

# Set proper permissions for SSH key
chmod 600 "$SSH_KEY"

# Prompt for server IP if not provided
if [ -z "$SSH_HOST" ]; then
    read -p "Enter your server IP address: " SSH_HOST
fi

if [ -z "$SSH_HOST" ]; then
    echo "ERROR: Server IP address is required"
    exit 1
fi

echo "Target server: $SSH_USER@$SSH_HOST"

# Test SSH connection
echo "Testing SSH connection..."
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o BatchMode=yes "$SSH_USER@$SSH_HOST" "echo 'SSH connection successful'" 2>/dev/null; then
    echo "ERROR: SSH connection failed. Please check:"
    echo "1. Server IP address is correct"
    echo "2. SSH key has correct permissions (600)"
    echo "3. Server allows SSH key authentication"
    exit 1
fi

echo "SSH connection successful"

# Build the application locally first
echo "Building the application locally..."
cd resident-ui
npm ci --production=false
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "ERROR: Build failed - dist directory not found"
    exit 1
fi

echo "Build completed successfully"

# Change back to the original directory
cd ..

# Create deployment package
echo "Creating deployment package..."
DEPLOY_PACKAGE="resident-ui-deploy-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$DEPLOY_PACKAGE" -C resident-ui/dist .

echo "Deployment package created: $DEPLOY_PACKAGE"

# Upload and deploy to server
echo "Uploading and deploying to server..."

# Create remote deployment script
cat > deploy-remote.sh << 'REMOTE_SCRIPT'
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
REMOTE_SCRIPT

# Upload files to server
echo "Uploading files to server..."
scp -i "$SSH_KEY" "$DEPLOY_PACKAGE" deploy-remote.sh "$SSH_USER@$SSH_HOST:/home/ubuntu/"

# Execute deployment on server
echo "Executing deployment on server..."
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" << 'SSH_COMMANDS'
cd /home/ubuntu
chmod +x deploy-remote.sh
mv resident-ui-deploy-*.tar.gz resident-ui-deploy.tar.gz
./deploy-remote.sh
rm -f resident-ui-deploy.tar.gz deploy-remote.sh
SSH_COMMANDS

echo "Resident UI deployment completed successfully!"
echo "Your application should be available at: http://apt.aircokopen.nu/resident-ui"
echo "Backup of previous deployment is available at: /var/www/html/resident-ui-backup" 