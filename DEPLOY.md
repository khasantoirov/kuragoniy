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
---

## 9. Rollar, portallar va xavfsizlik (2026-10 yangilanishi)

### Oynalar (portallar)

| Rol | Oyna | Kirish |
|---|---|---|
| O'quvchi | `/s` — darslar (nazariya, formula, video), test/masala, uyga vazifa, o'yinlar, natijalar | login (ism+familiya, masalan `valialiyev`; adashi bo'lsa `valialiyev2`) + parol |
| O'qituvchi | asosiy ilova + «Sinf va o'quvchilar» bo'limi (sinflarim statistikasi, o'quvchilar, vazifalar, tayyorgarlik, hisobotlar, natijalar, o'yinlar, do'kon) — faqat o'z sinflari | login yoki email + parol |
| Admin / Boshliq / Dasturchi | yuqoridagilar + «Ma'muriyat» (tahlil, hisobotlarni baholash, rag'batlantirish, o'quv materiallari, sotuv bo'limi, xavfsizlik jurnali) | email + parol |
| Kuzatuvchi | faqat «Ma'muriyat» — hamma narsani **ko'radi**, hech narsani o'zgartira olmaydi (server darajasida) | email + parol |

Kirish sahifasi hamma uchun bitta (rol tanlanmaydi), «Eslab qolish» belgilanmasa sessiya brauzer yopilganda tugaydi. O'zi ro'yxatdan o'tish bosh sahifadan olib tashlangan: yangi o'qituvchini admin yaratadi — Boshqaruv → Foydalanuvchilar → «+ Yangi xodim» (login ism+familiyadan, bir martalik parol). Sinfni boshqa o'qituvchiga o'tkazish: Hamkor maktablar → maktab → «Sinflar» jadvalidagi o'qituvchi tanlagichi.

Rollarni faqat **dasturchi** beradi: Boshqaruv → Foydalanuvchilar → «Admin / Boshliq / Kuzatuvchi qilish».

Yangilanishlar oynasiz, avtomatik o'rnatiladi — lekin faqat hech narsa yo'qolmaydigan paytda (saqlanmagan yozuv, ochiq oyna, test yoki jonli o'yin bo'lsa kutadi): `frontend/src/components/AutoUpdate.tsx`.

### Parolni tiklash (dasturchisiz)

1. **O'zi** — «Parolni unutdingizmi?» → login/email → kod Telegram bot orqali keladi (10 daqiqa, 5 urinish). Buning uchun foydalanuvchi oldindan Sozlamalar/Profil'da «Telegramni ulash»ni bosgan bo'lishi kerak. SMTP sozlansa (`EMAIL_HOST` ...), kod emailga ham boradi.
2. **O'quvchi** — o'z o'qituvchisi: O'quvchilar → «Parolni tiklash» (vaqtinchalik parol, birinchi kirishda almashtiriladi).
3. **O'qituvchi** — administrator: Boshqaruv → «Parolni tiklash».

### Xavfsizlik choralari

- Hisob bloklash: 5 marta noto'g'ri parol → 15 daqiqa (`LOGIN_LOCKOUT_*`), egasiga Telegram ogohlantirishi.
- Parol o'zgarsa/tiklansa/hisob bloklansa — barcha qurilmalardagi sessiyalar darhol bekor qilinadi.
- O'quvchi hisobi xodimlar API'siga umuman kira olmaydi (markaziy tekshiruv: `common/authentication.py`).
- Test javoblari faqat serverda tekshiriladi; variantlar har urinishda aralashtiriladi.
- Telegram ulash — bir martalik 15 daqiqalik token (avvalgi ID orqali ulash teshigi yopildi).
- Barcha kirishlar va ma'muriy amallar «Xavfsizlik jurnali»da (IP bilan) 400 kun saqlanadi.

### Birinchi marta yangilashda (bir martalik)

```bash
cd /opt/amaliy-fizika/backend
# 1) Zaxira shifrlash kaliti — chiqqan qiymatni .env ga BACKUP_ENCRYPTION_KEY= qilib yozing
#    va serverdan TASHQARIDA ham saqlang (parol menejeri). Usiz shifrlangan zaxira ochilmaydi.
./venv/bin/python manage.py backup_db --generate-key
# 2) Nginx xavfsizlik sarlavhalari
sudo cp /opt/amaliy-fizika/deploy/nginx/security-headers.conf /etc/nginx/snippets/amaliyfizika-security.conf
#    jonli /etc/nginx/sites-available/amaliyfizika ichidagi 443-server blokiga va
#    o'z add_header'i bor har bir location'ga qo'shing:
#        include snippets/amaliyfizika-security.conf;
sudo nginx -t && sudo systemctl reload nginx
```

Shifrlangan zaxirani ochish: `./venv/bin/python manage.py decrypt_backup db-....sqlite3.gz.enc`

O'quvchi loginlarini yangi formatga o'tkazish (2026-10, bir martalik; parollar o'zgarmaydi, eski login ham ishlayveradi va kirganda yangisi ko'rsatiladi):

```bash
./venv/bin/python manage.py rename_student_logins          # reja
./venv/bin/python manage.py rename_student_logins --apply  # saqlash
```

## 9. Kengaytirish (1000+ foydalanuvchi)

Hozirgi server (1 vCPU, 512 MB RAM, SQLite) bir necha yuz faol foydalanuvchini ko'taradi.
Ming va undan ko'p o'quvchi bir vaqtda ishlashi kutilsa:

1. **Serverni kattalashtirish** — kamida 2 vCPU / 2–4 GB RAM.
2. **PostgreSQL'ga o'tish** (kod tayyor, faqat sozlama):
   ```bash
   sudo apt install postgresql && sudo -u postgres createuser amaliy -P && sudo -u postgres createdb -O amaliy amaliyfizika
   ./venv/bin/pip install "psycopg[binary]"
   ./venv/bin/python manage.py dumpdata --natural-foreign --exclude contenttypes --exclude auth.permission > dump.json
   # .env:  DATABASE_URL=postgres://amaliy:PAROL@127.0.0.1:5432/amaliyfizika
   ./venv/bin/python manage.py migrate && ./venv/bin/python manage.py loaddata dump.json
   ```
   (`backup_db` hozircha SQLite uchun; PostgreSQL'da `pg_dump` bilan zaxira oling.)
3. **Bir nechta daphne jarayoni** — systemd unit'ni `-p 8001`, `-p 8002` bilan ko'paytirib, nginx `upstream`ga qo'shing (Redis allaqachon umumiy kesh va kanal qatlami vazifasini bajaradi).
4. Statik/media fayllarni CDN orqali berish (ixtiyoriy).
