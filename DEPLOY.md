# VPS'ga joylashtirish (systemd)

### 1. Server tayyorlash

```bash
sudo apt update && sudo apt install -y python3.12 python3.12-venv nginx redis-server git nodejs npm
```

### 2. Loyihani yuklash va sozlash

```bash
sudo mkdir -p /opt/kuragoniy && sudo chown $USER /opt/kuragoniy
git clone <repo-url> /opt/kuragoniy && cd /opt/kuragoniy

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
- `DJANGO_ALLOWED_HOSTS` — domeningiz (masalan `kuragoniy.uz`)
- `CORS_ALLOWED_ORIGINS` — frontend manzili (`https://kuragoniy.uz`)
- `BOT_TOKEN` — Telegram bot tokeni (@BotFather'da yangi bot yarating)
- `FRONTEND_URL` — parolni tiklash havolalari uchun (`https://kuragoniy.uz`)

### 3. systemd xizmatlarini o'rnatish

```bash
sudo cp deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kuragoniy-backend kuragoniy-bot kuragoniy-backup.timer
```

Fayl egaligini tekshiring — unit fayllar `www-data` foydalanuvchisi nomidan ishlaydi:

```bash
sudo chown -R www-data:www-data /opt/kuragoniy
```

### 4. Nginx

```bash
sudo cp deploy/nginx/kuragoniy.conf /etc/nginx/sites-available/kuragoniy
sudo ln -s /etc/nginx/sites-available/kuragoniy /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`deploy/nginx/kuragoniy.conf` ichidagi `server_name` va yo'llarni (`/opt/kuragoniy/...`) o'zingizga moslang.

### 5. HTTPS

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d kuragoniy.uz -d www.kuragoniy.uz
```

### 6. Yangilash (keyingi deploy'lar)

```bash
cd /opt/kuragoniy && git pull
cd backend && ./venv/bin/pip install -r requirements.txt && ./venv/bin/python manage.py migrate
cd ../frontend && npm ci && npm run build
sudo systemctl restart kuragoniy-backend kuragoniy-bot
```

### 7. Zaxira nusxalash (backup)

`kuragoniy-backup.timer` orqali avtomatik ishlaydi (`manage.py backup_db`). Qo'lda ishga tushirish:

```bash
cd /opt/kuragoniy/backend && ./venv/bin/python manage.py backup_db
```

### Monitoring

```bash
sudo journalctl -u kuragoniy-backend -f
sudo journalctl -u kuragoniy-bot -f
```

### 8. Avtomatik deploy (GitHub Actions)

`main`'ga har push'da `.github/workflows/deploy.yml` serverga SSH orqali ulanib
"6. Yangilash" qadamlarini bajaradi. Bir martalik sozlash:

**Serverda:**

```bash
# Deploy uchun alohida foydalanuvchi (yoki mavjudini ishlating)
sudo adduser --disabled-password deploy
sudo usermod -aG www-data deploy
sudo chmod -R g+w /opt/kuragoniy   # deploy foydalanuvchisi yoza olishi uchun

# SSH kalit juftligi (local mashinada yarating, private qismini GitHub Secrets'ga qo'shasiz)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key -N ""
# deploy_key.pub ni serverda:
sudo -u deploy mkdir -p /home/deploy/.ssh
echo "<deploy_key.pub mazmuni>" | sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys
sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys

# systemctl restart uchun parolsiz sudo (faqat shu ikki xizmatga)
echo 'deploy ALL=(root) NOPASSWD: /bin/systemctl restart kuragoniy-backend, /bin/systemctl restart kuragoniy-bot' | sudo tee /etc/sudoers.d/deploy-restart
sudo visudo -c   # sintaksisni tekshirish
```

**GitHub repo sozlamalarida** (Settings → Secrets and variables → Actions → New repository secret):

| Secret | Qiymat |
|---|---|
| `DEPLOY_HOST` | server IP yoki domen (masalan `kuragoniy.uz`) |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | `deploy_key` faylining **to'liq mazmuni** (private key) |
| `DEPLOY_PORT` | SSH porti (ixtiyoriy, standart `22`) |

Sozlangandan so'ng `main`'ga push qilinganda deploy avtomatik ishga tushadi;
qo'lda ishga tushirish uchun GitHub → Actions → Deploy → "Run workflow".
