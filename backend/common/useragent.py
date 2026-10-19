"""Device summary for the sessions list and "new device" notices:
"Samsung Galaxy A52 · Android 13 · Chrome 141", "Apple iPhone · iOS 17.4 ·
Safari 17", "Kompyuter · Windows 11 · Edge 141".

The User-Agent alone no longer names the phone — Chrome on Android sends
"Linux; Android 10; K" for every device, and Windows 11 still calls itself
"Windows NT 10.0". So the app also sends its User-Agent Client Hints
(navigator.userAgentData: model, platform version, form factor) in the
X-Device header (frontend/src/lib/device.ts); they are stored on the
session and fill in what the UA hides. Browsers expose no maker for a PC
or laptop, so those stay "Kompyuter" plus the system and browser."""

import re
from urllib.parse import parse_qsl

_BROWSERS = (
    ('Telegram', re.compile(r'Telegram', re.I), None),
    ('Yandex', re.compile(r'YaBrowser', re.I), re.compile(r'YaBrowser/(\d+)')),
    ('Opera', re.compile(r'OPR/|Opera', re.I), re.compile(r'OPR/(\d+)')),
    ('Edge', re.compile(r'Edg(e|A|iOS)?/', re.I), re.compile(r'Edg(?:e|A|iOS)?/(\d+)')),
    ('Samsung Internet', re.compile(r'SamsungBrowser', re.I), re.compile(r'SamsungBrowser/(\d+)')),
    ('Firefox', re.compile(r'Firefox|FxiOS', re.I), re.compile(r'(?:Firefox|FxiOS)/(\d+)')),
    ('Chrome', re.compile(r'Chrome|CriOS', re.I), re.compile(r'(?:Chrome|CriOS)/(\d+)')),
    ('Safari', re.compile(r'Safari', re.I), re.compile(r'Version/(\d+(?:\.\d)?)')),
)
_SYSTEMS = (
    ('iPhone', re.compile(r'iPhone', re.I)),
    ('iPad', re.compile(r'iPad', re.I)),
    ('Android', re.compile(r'Android', re.I)),
    ('Windows', re.compile(r'Windows', re.I)),
    ('macOS', re.compile(r'Mac OS X|Macintosh', re.I)),
    ('ChromeOS', re.compile(r'CrOS', re.I)),
    ('Linux', re.compile(r'Linux|X11', re.I)),
)
KIND_LABELS = {'phone': 'Telefon', 'tablet': 'Planshet', 'desktop': 'Kompyuter'}

# Hint keys the client sends (lib/device.ts) and the session stores.
_HINT_KEYS = ('model', 'pv', 'p', 'ff', 'tp')


def parse_hints(raw: str | None) -> dict:
    """X-Device header ("model=SM-A525F&pv=13.0.0&p=Android&ff=Mobile")
    → a small clean dict; anything unexpected is dropped."""
    out = {}
    for key, value in parse_qsl((raw or '')[:400]):
        if key in _HINT_KEYS:
            value = re.sub(r'[^\w .()+\-/,]', '', value).strip()[:60]
            if value:
                out[key] = value
    return out


def _major(version: str) -> int | None:
    m = re.match(r'(\d+)', version or '')
    return int(m.group(1)) if m else None


# ── Samsung model codes → marketing names ──────────────────────────────
_S_SUFFIX = {'1': '', '6': '+', '8': ' Ultra', '0': ' FE'}
_G_GEN = {'9': ('S21', _S_SUFFIX), '8': ('S20', _S_SUFFIX), '7': ('S10', {'0': 'e', '3': '', '5': '+'}),
          '6': ('S9', {'0': '', '5': '+'}), '5': ('S8', {'0': '', '5': '+'})}


def _samsung(series: str, digits: str) -> str:
    d0, d1, d2 = digits[0], digits[1], digits[2]
    if series in 'AM':
        return f'Galaxy {series}{d0}{d1}'
    if series == 'E':
        return f'Galaxy F{d0}{d1}'
    if series == 'S' and d0 == '9' and d2 in _S_SUFFIX and d2 != '0':
        return f'Galaxy S{22 + int(d1)}{_S_SUFFIX[d2]}'
    if series == 'S' and d0 == '7':
        return f'Galaxy S{22 + int(d1)} FE'
    if series == 'G' and d0 == '9' and d1 in _G_GEN:
        name, suffixes = _G_GEN[d1]
        if d2 in suffixes:
            return f'Galaxy {name}{suffixes[d2]}'
    if series == 'N' and d0 == '9':
        gen = {'6': 'Note9', '7': 'Note10', '8': 'Note20'}.get(d1)
        if gen:
            plus = {'7': '+', '8': ' Ultra'}.get(d1) if d2 in '56' else ''
            return f'Galaxy {gen}{plus or ""}'
    if series == 'F' and d0 == '9':
        return 'Galaxy Z Fold' + (str(int(d1) + 1) if d1 != '0' else '')
    if series == 'F' and d0 == '7':
        return 'Galaxy Z Flip' + (str(int(d1) + 2) if d1 != '0' else '')
    if series in 'TXP':
        return 'Galaxy Tab'
    if series == 'J':
        return f'Galaxy J{d0}'
    return f'Galaxy {series}{digits}'


# Model prefixes / patterns → maker, for phones that report a code
# ("RMX3360") or a name without the maker ("Redmi Note 8 Pro").
_MAKERS = (
    (re.compile(r'^(redmi|poco|mi |mix|xiaomi)', re.I), 'Xiaomi', True),
    (re.compile(r'^(M2\d{3}[A-Z0-9]{2,5}|2[0-5]\d{2}[A-Z0-9]{3,7})$'), 'Xiaomi', False),
    (re.compile(r'^tecno', re.I), 'Tecno', True),
    (re.compile(r'^infinix', re.I), 'Infinix', True),
    (re.compile(r'^itel', re.I), 'itel', True),
    (re.compile(r'^RMX\d', re.I), 'realme', False),
    (re.compile(r'^realme', re.I), 'realme', True),
    (re.compile(r'^(oneplus|(IN|LE|KB|NE|PJ|PH|BE)2\d{3}$)', re.I), 'OnePlus', True),
    (re.compile(r'^(CPH\d|PD[A-Z]{2}\d|oppo)', re.I), 'OPPO', True),
    (re.compile(r'^(vivo|V2\d{3}|I2\d{3})', re.I), 'vivo', True),
    (re.compile(r'^pixel', re.I), 'Google', True),
    (re.compile(r'^(moto|motorola|XT\d{4})', re.I), 'Motorola', True),
    (re.compile(r'^nokia', re.I), 'Nokia', True),
    (re.compile(r'^honor', re.I), 'Honor', True),
    (re.compile(r'^huawei', re.I), 'Huawei', True),
    (re.compile(r'^[A-Z]{3}-[A-Z]{1,3}\d{1,2}[A-Z]?$'), 'Huawei', False),
    (re.compile(r'^(lenovo|TB-)', re.I), 'Lenovo', True),
    (re.compile(r'^(zte|blade)', re.I), 'ZTE', True),
    (re.compile(r'^(sony|XQ-|SO-)', re.I), 'Sony', True),
    (re.compile(r'^(LM-|LG-)', re.I), 'LG', False),
    (re.compile(r'^asus', re.I), 'ASUS', True),
    (re.compile(r'^nothing', re.I), 'Nothing', True),
    (re.compile(r'^galaxy', re.I), 'Samsung', True),
)


def android_device(model: str) -> str:
    """"SM-A525F" → "Samsung Galaxy A52", "Redmi Note 8 Pro" → "Xiaomi
    Redmi Note 8 Pro", "RMX3360" → "realme RMX3360"; '' when unknown."""
    model = (model or '').strip()
    if not model or model.upper() in ('K', 'MOBILE'):
        return ''
    sm = re.match(r'^(?:SAMSUNG[ -])?SM-([A-Z])(\d{3})', model, re.I)
    if sm:
        return 'Samsung ' + _samsung(sm.group(1).upper(), sm.group(2))
    for rx, maker, strip_maker in _MAKERS:
        if rx.search(model):
            rest = re.sub(rf'^{re.escape(maker)}[ _-]*', '', model, flags=re.I) if strip_maker else model
            return f'{maker} {rest}'.strip()
    return model


def _ua_model(ua: str) -> str:
    """The model an un-reduced UA still carries: Telegram's in-app browser,
    Samsung Internet, MIUI's browser, older Chrome."""
    tg = re.search(r'Telegram-Android/[\d.]+ \(([^;]+);', ua)
    if tg:
        return tg.group(1).strip()
    m = re.search(r'Android [\d.]+; (?:wv; )?([^;)]+?)(?: Build/[^;)]*)?[;)]', ua)
    if m:
        model = re.sub(r'^SAMSUNG ', '', m.group(1).strip(), flags=re.I)
        if model.upper() not in ('K', 'MOBILE', 'U', 'WV') and not model.startswith(('Linux', 'en-', 'ru-')):
            return model
    return ''


def summarize(user_agent: str | None, hints: dict | None = None) -> dict:
    ua = user_agent or ''
    hints = hints or {}
    browser = 'Brauzer'
    browser_full = browser
    for name, rx, version_rx in _BROWSERS:
        if rx.search(ua):
            browser = name
            version = version_rx.search(ua) if version_rx else None
            browser_full = f'{name} {version.group(1)}' if version else name
            break
    system = next((name for name, rx in _SYSTEMS if rx.search(ua)), "Noma'lum tizim")
    pv = hints.get('pv', '')
    form = hints.get('ff', '').lower()

    kind, device, model = 'desktop', '', ''
    os_full = system
    if system == 'iPhone':
        kind, device = 'phone', 'Apple iPhone'
        v = re.search(r'iPhone OS (\d+)_(\d+)', ua)
        os_full = f'iOS {v.group(1)}.{v.group(2)}' if v else 'iOS'
    elif system == 'iPad':
        kind, device = 'tablet', 'Apple iPad'
        v = re.search(r'CPU OS (\d+)_(\d+)', ua)
        os_full = f'iPadOS {v.group(1)}.{v.group(2)}' if v else 'iPadOS'
    elif system == 'Android':
        model = hints.get('model') or _ua_model(ua)
        device = android_device(model)
        tablet = 'tablet' in form or (not re.search(r'Mobile', ua) and 'mobile' not in form) \
            or re.match(r'^(?:SAMSUNG[ -])?SM-[TXP]\d', model, re.I) is not None
        kind = 'tablet' if tablet else 'phone'
        version = _major(pv) or None
        if version is None:
            v = re.search(r'Android (\d+(?:\.\d+)?)', ua)
            # "Android 10; K" is Chrome's frozen placeholder, not the real version.
            if v and not re.search(r'Android 10; K\)', ua):
                version = v.group(1)
        os_full = f'Android {version}' if version else 'Android'
    elif system == 'Windows':
        nt = re.search(r'Windows NT (\d+\.\d+)', ua)
        major = _major(pv)
        if major is not None and nt and nt.group(1) == '10.0':
            os_full = 'Windows 11' if major >= 13 else 'Windows 10'
        elif nt:
            os_full = {'6.1': 'Windows 7', '6.2': 'Windows 8', '6.3': 'Windows 8.1'}.get(nt.group(1), 'Windows')
    elif system == 'macOS':
        if hints.get('tp', '0') not in ('', '0', '1'):
            kind, device, os_full = 'tablet', 'Apple iPad', 'iPadOS'
        else:
            device = 'Apple Mac'
            major = _major(pv)
            os_full = f'macOS {major}' if major and major >= 11 else 'macOS'

    mobile = kind != 'desktop' or bool(re.search(r'Mobile', ua))
    title = device or KIND_LABELS[kind]
    return {
        'browser': browser, 'os': system, 'mobile': mobile,
        'kind': kind, 'kind_label': KIND_LABELS[kind], 'device': device, 'model': model,
        'os_full': os_full, 'browser_full': browser_full,
        'label': f'{title} · {os_full} · {browser_full}',
        # Version-free, model-free key — what "is this a device we've seen?"
        # compares (same as the label before device details existed).
        'family': f'{browser} · {system}',
    }
