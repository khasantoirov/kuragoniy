import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


def generate_uid():
    return uuid.uuid4().hex


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        # Students log in with a teacher-generated `username` instead of an
        # email (most don't have one), so exactly one of the two is
        # required, not specifically email.
        username = (extra_fields.get('username') or '').strip().lower() or None
        extra_fields['username'] = username
        if not email and not username:
            raise ValueError("Email yoki login kiritilishi shart")
        # normalize_email() only lowercases the domain half — a mismatched
        # local-part case (e.g. registering as "Ivan@x.com") used to make
        # login fail with a correct password whenever it was typed back in
        # a different case, since ModelBackend does an exact-match lookup.
        # Fully lowercasing at write time keeps new accounts consistent;
        # get_by_natural_key() below covers existing mixed-case rows too.
        email = self.normalize_email(email).lower() if email else None
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def get_by_natural_key(self, login):
        # One login box for every portal: the login (username), or the one
        # it replaced. Ko'ragoniy Edu signs in by login + password or by
        # phone only — an email is never a way in (owner's decision,
        # 2026-11-20), so anything with an "@" matches nobody. ModelBackend
        # calls this with whatever was typed into the login field.
        login = (login or '').strip()
        if not login or '@' in login:
            raise self.model.DoesNotExist('Email bilan kirish yoqilmagan.')
        try:
            return self.get(username__iexact=login)
        except self.model.DoesNotExist:
            return self.get(previous_username__iexact=login)

    def find_by_login(self, login):
        """Same lookup as get_by_natural_key, but returns None instead of
        raising — for the login/password-reset views, which must behave
        the same whether or not the account exists."""
        login = (login or '').strip()
        if not login or '@' in login:
            return None
        return (self.filter(username__iexact=login).first()
                or self.filter(previous_username__iexact=login).first())

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.Role.ADMIN)
        extra_fields.setdefault('approved', True)
        extra_fields.setdefault('name', email.split('@')[0])
        if extra_fields.get('is_staff') is not True:
            raise ValueError("Superuser is_staff=True bo'lishi kerak")
        if extra_fields.get('is_superuser') is not True:
            raise ValueError("Superuser is_superuser=True bo'lishi kerak")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        TEACHER = 'teacher', "O'qituvchi"
        ADMIN = 'admin', 'Administrator'
        BOSHLIQ = 'boshliq', 'Boshliq'
        # Read-only oversight (inspector/methodist): sees every analytics,
        # results and report screen admins see, but every write is refused
        # server-side — see common/authentication.py and IsApproved.
        KUZATUVCHI = 'kuzatuvchi', 'Kuzatuvchi'
        # A partner school's own ma'muriyat (direktor, zavuch): sees only
        # their school(s) — schools.SchoolManager — and writes nothing.
        MAKTAB = 'maktab', "Maktab ma'muriyati"
        # Only ever reaches the student portal (/api/student/, games) —
        # every staff endpoint refuses them (common/authentication.py).
        STUDENT = 'student', "O'quvchi"

    # CharField PK (not auto-increment) so Firestore document uids can be
    # imported verbatim during data migration without a separate id-mapping
    # table for foreign keys elsewhere (see migration_tools app).
    id = models.CharField(primary_key=True, max_length=40, default=generate_uid, editable=False)

    # Nullable (still unique) since student accounts usually have no email
    # and log in with `username` instead — staff accounts keep using email.
    email = models.EmailField(unique=True, null=True, blank=True)
    username = models.CharField(max_length=40, unique=True, null=True, blank=True)
    # The login a student had before logins were regenerated
    # (manage.py rename_student_logins) — still accepted at sign-in, so
    # nobody is locked out before their teacher hands them the new one.
    previous_username = models.CharField(max_length=40, null=True, blank=True, db_index=True)
    # What everyone sees. Built from first_name + last_name once the first
    # name is set (accounts/profile.py); older accounts keep the full name
    # they were made with until they — or the developer — fill those in.
    name = models.CharField(max_length=150)
    first_name = models.CharField(max_length=40, blank=True)  # one word: "Hasan"
    last_name = models.CharField(max_length=60, blank=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.TEACHER)

    # Replaces the old hardcoded dev-email string comparison in
    # firestore.rules' isDev(); seeded once via a data migration for the
    # addresses in settings.DEV_SUPERUSER_EMAILS.
    is_dev_superuser = models.BooleanField(default=False)

    approved = models.BooleanField(default=False)
    # Fanlar the administration pointed this person to — codes from
    # common/subjects.py ('fizika', 'steam'); empty = not set yet (sees both).
    subjects = models.JSONField(default=list, blank=True)

    # Old Firestore field stored a base64 data-URL; this is now a real
    # uploaded file served from MEDIA_ROOT.
    photo = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bday = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=32, blank=True)

    telegram_linked = models.BooleanField(default=False)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    telegram_username = models.CharField(max_length=64, blank=True)


    # Set on teacher/admin-generated passwords: the account can do nothing
    # but change its password until it does (enforced server-side in
    # common/authentication.py, not just by the frontend).
    must_change_password = models.BooleanField(default=False)

    # Per-account brute-force lockout (accounts/views.py LoginView) — the
    # per-IP login throttle alone can't stop a slow guess against one
    # account, and a whole class logging in behind one school NAT means
    # that throttle can't be tight either.
    failed_login_count = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    # Presence (common/presence.py): the live "online now" signal lives in
    # the cache; these columns keep "last seen" / "logged out at" durable.
    last_seen_at = models.DateTimeField(null=True, blank=True)
    logged_out_at = models.DateTimeField(null=True, blank=True)

    # Every access/refresh token issued before this moment is rejected
    # (password change/reset, block, "log out everywhere") — without it a
    # stolen token keeps working until it expires on its own.
    tokens_valid_after = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # /admin/ site access only, separate from app-level `role`
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    class Meta:
        ordering = ['name']
        indexes = [models.Index(fields=['role', 'approved'])]

    def __str__(self):
        return self.email or self.username or self.name

    def save(self, *args, **kwargs):
        if self.first_name:
            self.name = f'{self.first_name} {self.last_name}'.strip()
            if kwargs.get('update_fields') is not None and {'first_name', 'last_name'} & set(kwargs['update_fields']):
                kwargs['update_fields'] = {*kwargs['update_fields'], 'name'}
        super().save(*args, **kwargs)

    @property
    def profile_complete(self):
        """A staff member's profile has what it must: first name, birth date, phone."""
        return bool(self.first_name and self.bday and self.phone)

    @property
    def login_name(self):
        return self.email or self.username or ''

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT and not self.is_dev_superuser

    @property
    def is_observer(self):
        return self.role == self.Role.KUZATUVCHI and not self.is_dev_superuser

    @property
    def is_school_admin(self):
        return self.role == self.Role.MAKTAB and not self.is_dev_superuser

    @property
    def is_admin(self):
        """Boshliq (a non-teaching head/director) has the same admin-level
        oversight as Admin — it's a distinct role label, not a narrower
        permission tier."""
        return self.is_dev_superuser or self.role in (self.Role.ADMIN, self.Role.BOSHLIQ)

    @property
    def is_oversight(self):
        """May *see* every teacher's data (analytics, results, reports) —
        admin-level roles plus the read-only Kuzatuvchi. Writes still go
        through is_admin."""
        return self.is_admin or self.is_observer

    @property
    def is_approved_effective(self):
        return self.is_dev_superuser or self.approved or self.role in (self.Role.ADMIN, self.Role.BOSHLIQ)

    @property
    def is_staff_member(self):
        """Approved non-student account — the gate for every staff-side
        endpoint (common/permissions.py IsApproved)."""
        return self.is_approved_effective and not self.is_student


class TelegramLinkToken(models.Model):
    """Single-use, short-lived payload for the bot's /start deep link.
    Replaces linking by raw user id — ids are visible to colleagues via
    the users API, so anyone could have attached their own Telegram to
    someone else's account and, now that Telegram is a password-reset
    channel, taken it over."""

    MAX_AGE_SECONDS = 15 * 60

    user = models.ForeignKey(User, related_name='telegram_link_tokens', on_delete=models.CASCADE)
    token = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)


class PasswordResetCode(models.Model):
    """Self-service password reset — a 6-digit code delivered over the
    account's linked Telegram (or email, when SMTP is configured). Only an
    HMAC of the code is stored; attempts are capped per code."""

    MAX_AGE_SECONDS = 10 * 60
    MAX_ATTEMPTS = 5

    user = models.ForeignKey(User, related_name='reset_codes', on_delete=models.CASCADE)
    code_hash = models.CharField(max_length=128)
    channels = models.CharField(max_length=32, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']


class UserSession(models.Model):
    """One signed-in device: created at login, refreshed whenever its
    refresh token is used, ended by logging out there, by "Chiqish" in the
    sessions list, or by any revoke-all (password change/reset, block).
    `jti` is the refresh token's id, so ending a session also blacklists
    exactly that token."""

    user = models.ForeignKey(User, related_name='sessions', on_delete=models.CASCADE)
    jti = models.CharField(max_length=64, unique=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    # The browser's User-Agent Client Hints (model, platform version…) —
    # common/useragent.py turns them into "Samsung Galaxy A52 · Android 13".
    device = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-last_seen_at']
        indexes = [models.Index(fields=['user', 'revoked_at'])]

    def __str__(self):
        return f'{self.user_id} · {self.jti[:8]}'


class PhoneVerification(models.Model):
    """Signing in with a phone number (2026-11-26: sign-in only; REGISTER
    stays for older rows). The number is proven through
    the platform's Telegram bot: the browser gets a `ticket`, the person
    opens the bot with `link_token` and shares their contact (Telegram
    vouches the number is theirs), and the bot sends a 6-digit code to that
    chat; an account already linked to Telegram gets the code straight away.
    Only an HMAC of the code is kept; tries are capped."""

    class Purpose(models.TextChoices):
        LOGIN = 'login', 'Kirish'
        REGISTER = 'register', "Ro'yxatdan o'tish"

    MAX_AGE_SECONDS = 20 * 60
    CODE_AGE_SECONDS = 10 * 60
    RESEND_SECONDS = 60
    MAX_ATTEMPTS = 5

    ticket = models.CharField(max_length=64, unique=True)
    link_token = models.CharField(max_length=64, unique=True)
    purpose = models.CharField(max_length=10, choices=Purpose.choices)
    phone = models.CharField(max_length=32)
    user = models.ForeignKey(User, null=True, blank=True, related_name='phone_verifications', on_delete=models.CASCADE)
    first_name = models.CharField(max_length=60, blank=True)
    last_name = models.CharField(max_length=60, blank=True)
    chat_id = models.BigIntegerField(null=True, blank=True)
    tg_username = models.CharField(max_length=64, blank=True)
    code_hash = models.CharField(max_length=128, blank=True)
    code_sent_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    verified_at = models.DateTimeField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.purpose} {self.phone}'
