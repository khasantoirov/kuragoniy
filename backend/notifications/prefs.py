"""Channel defaults and which kinds each role is offered in Settings."""

from .models import Kind, NotificationPreference

CHANNELS = ('app', 'telegram', 'email')

# Defaults keep today's behaviour: everything shows in the app, Telegram
# keeps the messages it already sent before this settings page existed
# (announcements, report reviews, awards, security, shop, homework),
# email is opt-in.
DEFAULTS = {
    Kind.ELON: {'app': True, 'telegram': True, 'email': False},
    Kind.HISOBOT: {'app': True, 'telegram': True, 'email': False},
    Kind.RAGBAT: {'app': True, 'telegram': True, 'email': False},
    Kind.OQUVCHI: {'app': True, 'telegram': True, 'email': False},
    Kind.VAZIFA: {'app': True, 'telegram': True, 'email': False},
    Kind.TUGILGAN: {'app': True, 'telegram': False, 'email': False},
    Kind.XAVFSIZLIK: {'app': True, 'telegram': True, 'email': False},
    Kind.DOKON: {'app': True, 'telegram': True, 'email': False},
    Kind.JAMOA: {'app': True, 'telegram': False, 'email': False},
    Kind.JURNAL: {'app': True, 'telegram': True, 'email': False},
    Kind.TIZIM: {'app': True, 'telegram': True, 'email': False},
    Kind.MALAKA: {'app': True, 'telegram': True, 'email': False},
    Kind.USTOZ: {'app': True, 'telegram': True, 'email': False},
    Kind.YORDAM: {'app': True, 'telegram': True, 'email': False},
    Kind.CHAMADON: {'app': True, 'telegram': True, 'email': False},
    Kind.LENTA: {'app': True, 'telegram': False, 'email': False},
    # a daily digest: to Telegram, not piling up in the inbox
    Kind.DARS: {'app': False, 'telegram': True, 'email': False},
}

DESCRIPTIONS = {
    Kind.ELON: "Ma'muriyat yuborgan e'lonlar",
    Kind.HISOBOT: 'Dars hisobotingiz baholanganda (ma\'muriyatga — yangi hisobot topshirilganda)',
    Kind.RAGBAT: "Sizga rag'bat yoki sertifikat berilganda",
    Kind.OQUVCHI: "O'quvchi sinf kodi bilan ro'yxatdan o'tganda",
    Kind.VAZIFA: 'Yangi uyga vazifa berilganda',
    Kind.TUGILGAN: "Hamkasblarning tug'ilgan kunlari (bugun va 3 kun oldin)",
    Kind.XAVFSIZLIK: "Yangi qurilmadan kirish, parol o'zgarishi va hisob bloklanishi",
    Kind.DOKON: "Buyurtmangiz holati o'zgarganda",
    Kind.JAMOA: "Jamoaga yangi xodim qo'shilganda",
    Kind.JURNAL: "O'tgan kun jurnalini tahrirlash uchun ruxsat so'ralganda, berilganda yoki rad etilganda; nazorat ishi natijalari kiritilganda",
    Kind.TIZIM: 'Hisobingiz tasdiqlanganda va boshqa tizim xabarlari',
    Kind.MALAKA: "Sizga malaka oshirish kursi biriktirilganda, muddati yaqinlashganda va sertifikat berilganda",
    Kind.USTOZ: "Mehmon ustoz so'rovingizga javob berilganda yoki sizni mehmon ustoz qilib taklif qilishganda "
                "(ma'muriyatga — yangi so'rov kelganda)",
    Kind.YORDAM: "Murojaatingizga javob berilganda (ma'muriyatga — yangi murojaat yoki xabar kelganda)",
    Kind.CHAMADON: "Jihoz so'rovingizga javob berilganda (ma'muriyatga — yangi so'rov kelganda)",
    Kind.LENTA: "Ustozlar lentasidagi postingizga izoh yozilganda",
    Kind.DARS: "Ertalab bugungi darslaringiz, kechqurun jurnalga yozilmagan darslar (dars kunlari)",
}


def kinds_for(user, fan=None) -> list[str]:
    """Kinds that can actually reach this user — the rows Settings shows.
    `fan` — the open window: Kerakli jihozlar are STEAM's, so the Fizika
    window leaves them out."""
    if user.is_student:
        return [Kind.VAZIFA, Kind.RAGBAT, Kind.XAVFSIZLIK, Kind.TIZIM]
    out = [Kind.ELON, Kind.HISOBOT, Kind.RAGBAT, Kind.OQUVCHI, Kind.TUGILGAN, Kind.XAVFSIZLIK]
    if not user.is_observer:
        out.append(Kind.JURNAL)
    if not user.is_observer and not user.is_school_admin:
        out += [Kind.DARS, Kind.MALAKA, Kind.USTOZ]
    if user.is_admin:
        out += [Kind.DOKON, Kind.JAMOA]
    if not user.is_observer:
        out += [Kind.CHAMADON, Kind.LENTA] if fan != 'fizika' else [Kind.LENTA]
    out += [Kind.YORDAM, Kind.TIZIM]
    return out


def merged(stored: dict | None) -> dict:
    out = {}
    for kind, default in DEFAULTS.items():
        row = dict(default)
        for channel, value in ((stored or {}).get(kind) or {}).items():
            if channel in CHANNELS:
                row[channel] = bool(value)
        out[str(kind)] = row
    return out


def channels_for_users(user_ids) -> dict:
    """{user_id: merged channel map} with one query."""
    stored = dict(
        NotificationPreference.objects.filter(user_id__in=list(user_ids)).values_list('user_id', 'channels')
    )
    return {uid: merged(stored.get(uid)) for uid in user_ids}


def allows(user_id, kind, channel) -> bool:
    return channels_for_users([user_id])[user_id][str(kind)][channel]
