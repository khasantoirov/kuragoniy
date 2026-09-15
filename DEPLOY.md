# VPS'ga joylashtirish (systemd)

### 1. Server tayyorlash

```bash
sudo apt update && sudo apt install -y python3.12 python3.12-venv nginx redis-server git nodejs npm
```

### 2. Loyihani yuklash va sozlash

```bash
sudo mkdir -p /opt/stem-lms && sudo chown $USER /opt/stem-lms
git clone <repo-url> /opt/stem-lms && cd /opt/stem-lms

# Backend
cd backend
python3.12 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env && nano .env   # REDIS_URL=redis://127.0.0.1:6379/0 va boshqa qiymatlarni to'ldiring
./venv/bin/python manage.py migrate
./venv/bin/python manage.py collectstatic --noinput

# Frontend
cd ../frontend
npm ci && npm run build   # natija: frontend/dist/
```

Muhim `.env` qatorlari:
- `DJANGO_SECRET_KEY` — yangi tasodifiy qiymat (`python -c "import secrets; print(secrets.token_urlsafe(50))"`)
- `DJANGO_ALLOWED_HOSTS` — domeningiz (masalan `stemlms.uz`)
- `CORS_ALLOWED_ORIGINS` — frontend manzili (`https://stemlms.uz`)
- `BOT_TOKEN` — Telegram bot tokeni (@BotFather'da yangi bot yarating)
- `FRONTEND_URL` — parolni tiklash havolalari uchun (`https://stemlms.uz`)

### 3. systemd xizmatlarini o'rnatish

```bash
sudo cp deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stemlms-backend stemlms-bot stemlms-backup.timer
```

Fayl egaligini tekshiring — unit fayllar `www-data` foydalanuvchisi nomidan ishlaydi:

```bash
sudo chown -R www-data:www-data /opt/stem-lms
```

### 4. Nginx

```bash
sudo cp deploy/nginx/stemlms.conf /etc/nginx/sites-available/stemlms
sudo ln -s /etc/nginx/sites-available/stemlms /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`deploy/nginx/stemlms.conf` ichidagi `server_name` va yo'llarni (`/opt/stem-lms/...`) o'zingizga moslang.

### 5. HTTPS

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d stemlms.uz -d www.stemlms.uz
```

### 6. Yangilash (keyingi deploy'lar)

```bash
cd /opt/stem-lms && git pull
cd backend && ./venv/bin/pip install -r requirements.txt && ./venv/bin/python manage.py migrate
cd ../frontend && npm ci && npm run build
sudo systemctl restart stemlms-backend stemlms-bot
```

### 7. Zaxira nusxalash (backup)

`stemlms-backup.timer` orqali avtomatik ishlaydi (`manage.py backup_db`). Qo'lda ishga tushirish:

```bash
cd /opt/stem-lms/backend && ./venv/bin/python manage.py backup_db
```

### Monitoring

```bash
sudo journalctl -u stemlms-backend -f
sudo journalctl -u stemlms-bot -f
```
