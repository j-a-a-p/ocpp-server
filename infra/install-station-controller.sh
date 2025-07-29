#!/bin/bash

sudo tee /etc/systemd/system/station-controller.service > /dev/null << 'EOF'
[Unit]
Description=OCPP WebSocket Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/ocpp-server/station-controller
ExecStart=/home/ubuntu/myenv/bin/python3 main.py
StandardOutput=append:/home/ubuntu/station-controller.log
StandardError=append:/home/ubuntu/station-controller.log
Restart=on-failure
User=ubuntu
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

echo "OCPP systemd service file created at /etc/systemd/system/station-controller.service"

sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable station-controller

echo "sudo systemctl start station-controller.service"