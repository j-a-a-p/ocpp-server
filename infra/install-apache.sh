#!/bin/bash
sudo apt update
sudo apt install apache2 -y
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo a2enmod ssl
sudo a2enmod headers
sudo systemctl restart apache2
sudo apt install certbot python3-certbot-apache -y

sudo certbot --apache

sudo touch /var/www/html/meter_values.json
sudo touch /var/www/html/meter_values.csv
sudo chown ubuntu:www-data /var/www/html/meter_values.*

# Create management-ui directory and symbolic link for deployment
sudo mkdir -p /var/www/html/management-ui
sudo ln -sf /var/www/html/management-ui /home/ubuntu/management-ui
sudo chown ubuntu:www-data /var/www/html/management-ui
sudo chown ubuntu:www-data /home/ubuntu/management-ui

# Create resident-ui directory and symbolic link for deployment
sudo mkdir -p /var/www/html/resident-ui
sudo ln -sf /var/www/html/resident-ui /home/ubuntu/resident-ui
sudo chown ubuntu:www-data /var/www/html/resident-ui
sudo chown ubuntu:www-data /home/ubuntu/resident-ui

# Enable rewrite module for SPA routing
sudo a2enmod rewrite

# Copy the SSL configuration with SPA routing
sudo cp apt.aircokopen.nu-le-ssl.conf /etc/apache2/sites-available/
sudo a2ensite apt.aircokopen.nu-le-ssl.conf

# Restart Apache to apply changes
sudo systemctl restart apache2
