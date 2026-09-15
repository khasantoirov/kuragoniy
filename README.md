# STEM LMS · Muhandis_D laboratoriyasi

STEM (fan, texnika, muhandislik, matematika) o'qituvchilari uchun dars, jurnal, jadval
va o'quv platformasi — Amaliy-Fizika-V2'dan fork qilingan.

Django + DRF + Channels backend va React + TypeScript frontend, VPS'da systemd orqali
joylashtiriladi (`stemlms.uz` — haqiqiy domeningizga almashtiring). `src/features/lab/`
hozircha asl loyihadan meros bo'lib qolgan fizika simulyatsiyalarini saqlaydi — STEM'ga
mos kontent (robototexnika, elektronika va h.k.) bilan almashtirish yoki olib tashlash
hali qaror qilinmagan.

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
  src/features/lab/sims.ts — meros bo'lib qolgan fizika simulyatsiyalari (qarang: yuqoridagi izoh)

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
