#!/bin/bash

# Create the OCPP systemd service file
sudo tee /etc/systemd/system/cloud-api.service > /dev/null << 'EOF'
[Unit]
Description=OCPP WebSocket Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/ocpp-server/cloud-api
ExecStart=/home/ubuntu/myenv/bin/python3 main.py
StandardOutput=append:/home/ubuntu/cloud-api.log
StandardError=append:/home/ubuntu/cloud-api.log
Restart=on-failure
User=ubuntu
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

echo "OCPP systemd service file created at /etc/systemd/system/ocpp.service"

# Reload systemd to recognize the new service
sudo systemctl daemon-reload

echo "Systemd daemon reloaded. You can now enable and start the service with:"
echo "sudo systemctl enable cloud-api.service"
echo "sudo systemctl start cloud-api.service" 