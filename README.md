# Amaliy Fizika · Muhandis_D laboratoriyasi

Fizika o'qituvchilari uchun dars, jurnal, jadval va interaktiv laboratoriya platformasi.

Django + DRF + Channels backend va React + TypeScript frontend, VPS'da systemd orqali
joylashtirilgan (`amaliyfizika.uz`). Eski Firebase/vanilla-JS versiya butunlay olib
tashlangan — migratsiya yakunlangan.

## Tuzilishi

```
backend/    — Django loyihasi (API + Channels + Telegram bot)
  accounts/       — foydalanuvchilar, rol, tasdiqlash, JWT auth
  lessons/        — darslar + tajribalar
  journal/        — sinf jurnali (baho/davomat)
  timetable/      — haftalik jadval
  library/        — resurslar kutubxonasi
  announcements/  — e'lonlar + real-time push
  telegrambot/    — bot (aiogram) + backup tizimi
  realtime/       — Channels consumerlari
  tests/          — pytest — rol/ruxsat matritsasi

frontend/   — React + TypeScript (Vite)
  src/features/   — har bo'lim uchun alohida papka (lessons, journal, lab, ...)
  src/features/lab/sims.ts — fizika simulyatsiyalari

deploy/     — systemd unit fayllari, nginx config
```

## Lokal ishga tushirish

### Backend

```bash
cd backend
python -m venv venv
./venv/Scripts/pip install -r requirements.txt   # Windows: venv\Scripts\pip
cp .env.example .env   # to'ldiring
./venv/Scripts/python manage.py migrate
./venv/Scripts/python manage.py runserver
```

Testlar: `pytest tests/`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite dev-server `/api` va `/ws` so'rovlarini `localhost:8000`dagi backend'ga
avtomatik proxy qiladi (`vite.config.ts`).

### Telegram bot

```bash
cd backend
./venv/Scripts/python manage.py runbot   # BOT_TOKEN .env'da bo'lishi kerak
```

## Joylashtirish

Batafsil qo'llanma: **[DEPLOY.md](DEPLOY.md)** — systemd orqali VPS'ga joylashtirish.
