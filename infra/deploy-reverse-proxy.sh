#!/bin/bash

# Deploy Reverse Proxy Configuration
echo "Setting up reverse proxy for API endpoints..."

# Install required Apache modules
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo a2enmod ssl
sudo a2enmod headers
sudo a2enmod rewrite

# Copy the virtual host configuration
sudo cp apache-vhost.conf /etc/apache2/sites-available/aircokopen.nu.conf

# Enable the site
sudo a2ensite aircokopen.nu.conf

# Disable default site (optional)
sudo a2dissite 000-default.conf

# Test Apache configuration
sudo apache2ctl configtest

if [ $? -eq 0 ]; then
    echo "Apache configuration is valid. Restarting Apache..."
    sudo systemctl restart apache2
    echo "Reverse proxy setup complete!"
    echo ""
    echo "Your API endpoints are now available at:"
    echo "  - https://aircokopen.nu/api/owners/"
    echo "  - https://aircokopen.nu/api/cards/"
    echo "  - https://aircokopen.nu/owners/"
    echo "  - https://aircokopen.nu/cards/"
    echo "  - wss://aircokopen.nu/ws (WebSocket)"
else
    echo "Apache configuration test failed. Please check the configuration."
    exit 1
fi 