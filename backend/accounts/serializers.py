from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Public-ish profile shape, shared with other approved users
    (mirrors the old users/{uid} read rule: approved users can see
    each other's name/photo/bday)."""

    class Meta:
        model = User
        fields = [
            'id', 'name', 'email', 'role', 'approved', 'photo',
            'bday', 'phone', 'telegram_linked', 'telegram_username',
            'is_dev_superuser', 'created_at', 'totp_enabled',
        ]
        read_only_fields = ['id', 'email', 'role', 'approved', 'is_dev_superuser', 'created_at', 'totp_enabled']


class MeSerializer(UserSerializer):
    """Self profile: same read-only set as UserSerializer, but the owner
    may edit their own name/photo/bday/phone (never role/approved).
    Also exposes telegram_chat_id (write-only-ish: only so the owner can
    null it out on disconnect) — not part of UserSerializer's public
    shape shared with other approved users."""

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ['telegram_chat_id']


class AdminUserSerializer(UserSerializer):
    """UserSerializer + telegram_chat_id, for admin/boshliq/dev-superuser
    viewers only (see UserAdminViewSet.get_serializer_class) — the id
    itself isn't sensitive, but there's no reason a plain teacher hitting
    this same list/retrieve endpoint should see a colleague's raw
    Telegram chat id, so it stays out of the base UserSerializer."""

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ['telegram_chat_id']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['email', 'name', 'password']

    def validate_password(self, value):
        # AUTH_PASSWORD_VALIDATORS (common-password/numeric-only/similarity
        # checks) is Django-wide config that only Django's own forms/mgmt
        # commands actually call — this API path bypassed it entirely
        # before, leaving "12345678" as a fully valid password with only
        # the length check below. Run it explicitly here.
        temp_user = User(email=self.initial_data.get('email', ''), name=self.initial_data.get('name', ''))
        try:
            validate_password(value, user=temp_user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def to_internal_value(self, data):
        # Normalize before the field's automatic uniqueness check runs
        # (that check compares the raw input, not UserManager's lowercased
        # value) — otherwise "Ivan@x.com" and "ivan@x.com" could both pass
        # as "unique" and register as two indistinguishable accounts that
        # get_by_natural_key()'s case-insensitive lookup can't tell apart.
        email = data.get('email')
        if isinstance(email, str):
            data = {**data, 'email': email.strip().lower()}
        return super().to_internal_value(data)

    def create(self, validated_data):
        email = validated_data['email']
        user = User.objects.create_user(
            email=email,
            password=validated_data['password'],
            name=validated_data['name'],
            role=User.Role.TEACHER,
            approved=False,
            is_dev_superuser=email in settings.DEV_SUPERUSER_EMAILS,
        )
        return user
