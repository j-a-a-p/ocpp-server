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
