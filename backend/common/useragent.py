"""A small, dependency-free User-Agent summary for the sessions list:
"Chrome · Windows", "Safari · iPhone", "Telegram · Android"."""

import re

_BROWSERS = (
    ('Telegram', re.compile(r'Telegram', re.I)),
    ('Yandex', re.compile(r'YaBrowser', re.I)),
    ('Opera', re.compile(r'OPR/|Opera', re.I)),
    ('Edge', re.compile(r'Edg(e|A|iOS)?/', re.I)),
    ('Samsung Internet', re.compile(r'SamsungBrowser', re.I)),
    ('Firefox', re.compile(r'Firefox|FxiOS', re.I)),
    ('Chrome', re.compile(r'Chrome|CriOS', re.I)),
    ('Safari', re.compile(r'Safari', re.I)),
)
_SYSTEMS = (
    ('iPhone', re.compile(r'iPhone', re.I)),
    ('iPad', re.compile(r'iPad', re.I)),
    ('Android', re.compile(r'Android', re.I)),
    ('Windows', re.compile(r'Windows', re.I)),
    ('macOS', re.compile(r'Mac OS X|Macintosh', re.I)),
    ('Linux', re.compile(r'Linux|X11', re.I)),
)


def summarize(user_agent: str | None) -> dict:
    ua = user_agent or ''
    browser = next((name for name, rx in _BROWSERS if rx.search(ua)), 'Brauzer')
    system = next((name for name, rx in _SYSTEMS if rx.search(ua)), "Noma'lum tizim")
    mobile = system in ('iPhone', 'iPad', 'Android') or bool(re.search(r'Mobile', ua))
    return {'browser': browser, 'os': system, 'mobile': mobile, 'label': f'{browser} · {system}'}
