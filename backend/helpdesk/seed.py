"""The first questions in Yordam markazi — added once to an empty list
(migration 0002); the administration edits or removes them afterwards."""

FAQ = [
    ('kirish', "Parolimni qanday o'zgartiraman?",
     "Sozlamalar → Profil → «Kirish va xavfsizlik» bo'limida joriy va yangi parolni kiriting.\n\n"
     "Parolni unutgan bo'lsangiz, kirish sahifasidagi «Parolni unutdingizmi?» havolasini bosing: "
     "tiklash kodi Telegram'ingizga (ulangan bo'lsa) yoki emailingizga keladi."),
    ('kirish', "Telegram'ni qanday ulayman?",
     "Sozlamalar → Integratsiyalar'da Telegram bo'limini oching va ko'rsatilgan havola orqali botni ishga "
     "tushiring. Ulangandan keyin bildirishnomalar va parolni tiklash kodi Telegram'ga keladi."),
    ('umumiy', "Qaysi xabarlar Telegram'ga kelishini qanday tanlayman?",
     "Sozlamalar → Bildirishnomalar'da har bir xabar turi uchun Ilova, Telegram va Email kanallarini alohida "
     "yoqish yoki o'chirish mumkin. Bildirishnoma ovozi ham shu yerda sozlanadi."),
    ('jurnal', "O'tgan kunga baho yoki davomat qo'ya olmayapman",
     "Baho va davomat dars kunining o'zida kiritiladi, o'tgan kun yopiladi. Jurnalda o'sha kunni bosib "
     "«Ruxsat so'rash»ni tanlang — administrator ruxsat bersa, kunni tahrirlay olasiz."),
    ('jadval', "Jadvalimni qayerda kiritaman?",
     "Jadval bo'limida hafta kunlari va soatlar bo'yicha maktab, sinf va xonani kiriting. Bosh sahifadagi "
     "«Bugungi darslar» va Ustozlar xonasi shu jadvaldan olinadi. Sinfni «7-A» ko'rinishida yozing."),
    ('jadval', "Ustozlar xonasida ertangi dars mavzusi qayerdan olinadi?",
     "Ustozlar xonasi jadvalingizdagi har bir darsga chorak sanalari bo'yicha shu haftaning mavzusini "
     "ko'rsatadi: dars fayli, jihozlar varag'i va darsga tayyorgarlik natijangiz bilan. Boshqa mavzu "
     "o'tsangiz, «Mavzuni almashtirish»dan tanlang — tanlovingiz saqlanadi."),
    ('jadval', "Darsga mehmon ustozni qanday chaqiraman?",
     "Ustozlar xonasida dars kartasidagi «Mehmon ustoz chaqirish» tugmasini bosing yoki «Mehmon ustoz» "
     "bo'limidan so'rov yuboring. So'rov ma'muriyatga boradi; javob berilganda bildirishnoma keladi."),
    ('malaka', "Malaka oshirish sertifikatini qanday olaman?",
     "Malaka oshirish bo'limida kursni oching. Har modul darslarini o'qib «O'qidim»ni bosing, so'ng modul "
     "testidan o'ting — keyingi modul ochiladi. Barcha modullardan o'tganingizda sertifikat avtomatik "
     "beriladi, uni chop etish yoki PDF qilib saqlash mumkin."),
    ('umumiy', "Savolimga javob topilmadi — nima qilaman?",
     "Shu sahifadagi «Murojaat yuborish» tugmasi bilan savolingizni yozing. Ma'muriyat javob berganda "
     "bildirishnoma keladi, yozishmani «Mening murojaatlarim»da davom ettirasiz."),
]
