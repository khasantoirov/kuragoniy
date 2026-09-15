FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]

# daphne serves ASGI (HTTP + WebSocket) — the bot service (docker-compose.yml)
# overrides this CMD to run `manage.py runbot` instead, sharing the same
# image and entrypoint (which runs migrations before either starts).
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
