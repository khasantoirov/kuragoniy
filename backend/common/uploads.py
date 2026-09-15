"""Shared validation for direct file uploads (lessons/library attachments).

The VPS this runs on has very little free disk (a few GB), so every upload
path enforces a strict size cap and extension whitelist rather than trusting
the client — see the "no video upload, external link only" decision this
mirrors for the same reason.
"""

from rest_framework.exceptions import ValidationError

MB = 1024 * 1024

# Magic-byte signatures per extension — the extension check alone only looks
# at the filename, so a file of any actual content could be renamed to pass
# it (e.g. an .html file renamed to .jpg). Checking the real header closes
# that gap without needing a heavyweight content-sniffing library, since the
# whitelist here is small and every format has a stable, well-known magic
# number. `.webp` is handled separately (RIFF container, signature isn't a
# fixed prefix).
_SIGNATURES = {
    '.pdf': (b'%PDF-',),
    '.jpg': (b'\xff\xd8\xff',),
    '.jpeg': (b'\xff\xd8\xff',),
    '.png': (b'\x89PNG\r\n\x1a\n',),
    '.doc': (b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1',),
    # .docx and .epub are both zip containers — the extension is what tells
    # them apart, the signature only confirms "this is actually a zip".
    '.docx': (b'PK\x03\x04',),
    '.epub': (b'PK\x03\x04',),
}


def _matches_signature(uploaded_file, ext):
    uploaded_file.seek(0)
    header = uploaded_file.read(16)
    uploaded_file.seek(0)
    if ext == '.webp':
        return header[:4] == b'RIFF' and header[8:12] == b'WEBP'
    sigs = _SIGNATURES.get(ext)
    if sigs is None:
        return True
    return any(header.startswith(sig) for sig in sigs)


def validate_upload(uploaded_file, allowed_extensions, max_mb):
    name = (uploaded_file.name or '').lower()
    matched_ext = next((ext for ext in allowed_extensions if name.endswith(ext)), None)
    if not matched_ext:
        allowed = ', '.join(allowed_extensions)
        raise ValidationError(f"Ruxsat etilgan formatlar: {allowed}")
    if uploaded_file.size > max_mb * MB:
        raise ValidationError(f"Fayl hajmi {max_mb}MB dan oshmasligi kerak")
    if not _matches_signature(uploaded_file, matched_ext):
        raise ValidationError("Fayl mazmuni uning kengaytmasiga mos kelmayapti.")


def delete_file_field(instance, field_name):
    """Removes the file from storage (not just the DB reference) — Django
    doesn't do this automatically on delete/replace, and disk space here is
    too tight to let attachments silently orphan on every re-upload."""
    field_file = getattr(instance, field_name)
    if field_file:
        field_file.delete(save=False)
