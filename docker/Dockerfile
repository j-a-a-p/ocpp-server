# Image for every Python part of the local stack: the cloud API, the station
# controller, the database seeder and the two mocks (SES and chargers).
# They share one image because they share the same dependencies.
#
# Build context is the repository root (see docker-compose.yml).

FROM python:3.12-slim-bookworm

ARG FLYWAY_VERSION=11.10.4

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Flyway runs the database migrations, same version as production. The archive
# bundles its own Java runtime.
RUN if [ "$(uname -m)" != "x86_64" ]; then \
        echo "This image downloads the x86-64 Flyway build. On an ARM machine build with DOCKER_DEFAULT_PLATFORM=linux/amd64." >&2; \
        exit 1; \
    fi \
    && curl -fsSL "https://download.red-gate.com/maven/release/com/redgate/flyway/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}-linux-x64.tar.gz" \
        | tar -xz --no-same-owner -C /opt \
    && chmod -R go+rX "/opt/flyway-${FLYWAY_VERSION}" \
    && ln -s "/opt/flyway-${FLYWAY_VERSION}/flyway" /usr/local/bin/flyway

# The pinned requirements of production, installed before the code so this layer is cached.
COPY cloud-api/requirements.txt /tmp/cloud-api-requirements.txt
COPY station-controller/requirements.txt /tmp/station-controller-requirements.txt
RUN pip install --no-cache-dir \
        -r /tmp/cloud-api-requirements.txt \
        -r /tmp/station-controller-requirements.txt

# The applications look for these exact paths (constants.py in both), so the
# container uses the same layout as the production server.
RUN useradd --create-home --uid 1000 --shell /bin/bash ubuntu \
    && mkdir -p /home/ubuntu/ocpp-data /var/www/html /etc/ocpp-server \
    && chown ubuntu:ubuntu /home/ubuntu/ocpp-data /var/www/html /etc/ocpp-server

COPY cloud-api /app/cloud-api
COPY station-controller /app/station-controller
COPY docker/seed.py docker/mock_ses.py docker/charger_simulator.py /app/tools/

USER ubuntu
WORKDIR /app/cloud-api
