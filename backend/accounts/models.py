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
        # One login box for every portal: anything with an "@" is an email
        # (staff), anything else a student username. ModelBackend calls
        # this with whatever was typed into the login field.
        login = (login or '').strip()
        if '@' in login:
            return self.get(email__iexact=login)
        try:
            return self.get(username__iexact=login)
        except self.model.DoesNotExist:
            return self.get(previous_username__iexact=login)

    def find_by_login(self, login):
        """Same lookup as get_by_natural_key, but returns None instead of
        raising — for the login/password-reset views, which must behave
        the same whether or not the account exists."""
        login = (login or '').strip()
        if not login:
            return None
        if '@' in login:
            return self.filter(email__iexact=login).first()
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
    name = models.CharField(max_length=150)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.TEACHER)

    # Replaces the old hardcoded dev-email string comparison in
    # firestore.rules' isDev(); seeded once via a data migration for the
    # addresses in settings.DEV_SUPERUSER_EMAILS.
    is_dev_superuser = models.BooleanField(default=False)

    approved = models.BooleanField(default=False)

    # Old Firestore field stored a base64 data-URL; this is now a real
    # uploaded file served from MEDIA_ROOT.
    photo = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bday = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=32, blank=True)

    telegram_linked = models.BooleanField(default=False)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    telegram_username = models.CharField(max_length=64, blank=True)

    # TOTP two-factor auth (RFC 6238) — totp_secret holds the pending or
    # active base32 secret; totp_enabled only flips to True once the user
    # has proven they can generate a valid code for it (accounts/views.py's
    # TwoFactorConfirmView), so a secret alone never gates login.
    totp_secret = models.CharField(max_length=32, blank=True)
    totp_enabled = models.BooleanField(default=False)

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
