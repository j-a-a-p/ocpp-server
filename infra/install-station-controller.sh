#!/bin/bash

sudo tee /etc/systemd/system/ocpp.service > /dev/null << 'EOF'
[Unit]
Description=OCPP WebSocket Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/ocpp-server/station-controller
ExecStart=/home/ubuntu/myenv/bin/python3 main.py
StandardOutput=append:/home/ubuntu/ocpp.log
StandardError=append:/home/ubuntu/ocpp.log
Restart=on-failure
User=ubuntu
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

echo "OCPP systemd service file created at /etc/systemd/system/ocpp.service"

sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable ocpp

echo "sudo systemctl start ocpp.service"