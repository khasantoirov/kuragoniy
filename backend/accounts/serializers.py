from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from common.presence import presence_of

from .models import User


class PresenceMixin(serializers.Serializer):
    """`online` + `last_seen` for staff-facing user lists. A view may pass
    a precomputed {user_id: presence} map as context['presence'] to avoid
    one cache lookup per row."""

    online = serializers.SerializerMethodField()
    last_seen = serializers.SerializerMethodField()

    def _presence(self, user):
        cached = self.context.get('presence', {}).get(user.pk)
        return cached if cached is not None else presence_of(user)

    def get_online(self, user):
        return self._presence(user)['online']

    def get_last_seen(self, user):
        seen = self._presence(user)['last_seen']
        return seen.isoformat() if seen else None


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

    Telegram fields are read-only here — linking only ever happens through
    the bot with a single-use token (TelegramLinkView), since a writable
    chat id would let anyone point their reset codes at an arbitrary chat.
    Unlinking still works through this endpoint for older cached clients
    that PATCH {telegram_linked: false} (see update())."""

    student = serializers.SerializerMethodField()

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + [
            'telegram_chat_id', 'username', 'must_change_password', 'student',
        ]
        read_only_fields = UserSerializer.Meta.read_only_fields + [
            'telegram_linked', 'telegram_chat_id', 'telegram_username', 'username', 'must_change_password',
        ]

    def get_student(self, user):
        if not user.is_student:
            return None
        profile = getattr(user, 'student_profile', None)
        if profile is None:
            return None
        jc = profile.journal_class
        return {
            'grade': profile.grade,
            'class_id': jc.id if jc else None,
            'class_name': jc.name if jc else '',
            'school': jc.school if jc else '',
            'teacher_name': jc.teacher.name if jc else '',
        }

    def validate(self, attrs):
        # A student's name comes from the class roster — renaming
        # themselves would only confuse their teacher's results screens.
        if self.instance is not None and self.instance.is_student:
            attrs.pop('name', None)
        return attrs

    def update(self, instance, validated_data):
        if self.initial_data.get('telegram_linked') is False:
            instance.telegram_linked = False
            instance.telegram_chat_id = None
            instance.telegram_username = ''
        return super().update(instance, validated_data)


class AdminUserSerializer(PresenceMixin, UserSerializer):
    """UserSerializer + telegram_chat_id, for admin/boshliq/dev-superuser
    viewers only (see UserAdminViewSet.get_serializer_class) — the id
    itself isn't sensitive, but there's no reason a plain teacher hitting
    this same list/retrieve endpoint should see a colleague's raw
    Telegram chat id, so it stays out of the base UserSerializer."""

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + [
            'telegram_chat_id', 'username', 'last_login', 'locked_until', 'failed_login_count', 'online', 'last_seen',
        ]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField()

    class Meta:
        model = User
        fields = ['email', 'name', 'password']

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Bu email allaqachon ro'yxatdan o'tgan")
        return value

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
        # Normalize before the uniqueness check runs — otherwise
        # "Ivan@x.com" and "ivan@x.com" could both pass as "unique" and
        # register as two indistinguishable accounts that
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
