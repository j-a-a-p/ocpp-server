#!/bin/bash

sudo mkdir /etc/ocpp-server
sudo chown ubuntu /etc/ocpp-server 
touch /etc/ocpp-server/configuration.ini
echo "configuration.ini created, but it is empty!"


# Download Flyway 11.10.4
wget -qO- https://download.red-gate.com/maven/release/com/redgate/flyway/flyway-commandline/11.10.4/flyway-commandline-11.10.4-linux-x64.tar.gz | tar -xvz && sudo ln -s `pwd`/flyway-11.10.4/flyway /usr/local/bin 

flyway -v