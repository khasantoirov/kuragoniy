import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


def generate_uid():
    return uuid.uuid4().hex


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Email manzil kiritilishi shart")
        # normalize_email() only lowercases the domain half — a mismatched
        # local-part case (e.g. registering as "Ivan@x.com") used to make
        # login fail with a correct password whenever it was typed back in
        # a different case, since ModelBackend does an exact-match lookup.
        # Fully lowercasing at write time keeps new accounts consistent;
        # get_by_natural_key() below covers existing mixed-case rows too.
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def get_by_natural_key(self, email):
        return self.get(**{f'{self.model.USERNAME_FIELD}__iexact': email})

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

    # CharField PK (not auto-increment) so Firestore document uids can be
    # imported verbatim during data migration without a separate id-mapping
    # table for foreign keys elsewhere (see migration_tools app).
    id = models.CharField(primary_key=True, max_length=40, default=generate_uid, editable=False)

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=150)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.TEACHER)

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

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # /admin/ site access only, separate from app-level `role`
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.email

    @property
    def is_admin(self):
        """Boshliq (a non-teaching head/director) has the same admin-level
        oversight as Admin — it's a distinct role label, not a narrower
        permission tier."""
        return self.is_dev_superuser or self.role in (self.Role.ADMIN, self.Role.BOSHLIQ)

    @property
    def is_approved_effective(self):
        return self.is_dev_superuser or self.approved or self.role in (self.Role.ADMIN, self.Role.BOSHLIQ)
