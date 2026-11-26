from rest_framework import serializers

from common.presence import presence_of

from .models import User
from .profile import clean_bday, clean_first_name, clean_last_name, clean_phone, split_full_name


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
    each other's name/photo/bday).

    `name` is built from first_name + last_name (User.save); an account
    from before the split has only `name`, and `name_guess` offers its
    [first, last] for the form to start from."""

    name_guess = serializers.SerializerMethodField()
    profile_complete = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'name', 'first_name', 'last_name', 'name_guess', 'profile_complete', 'email', 'role', 'approved',
            'photo', 'bday', 'phone', 'telegram_linked', 'telegram_username',
            'is_dev_superuser', 'created_at', 'subjects', 'is_panel_account',
        ]
        # subjects: set by the administration only (UserAdminViewSet.set_subjects)
        read_only_fields = ['id', 'name', 'email', 'role', 'approved', 'is_dev_superuser', 'created_at',
                            'subjects', 'is_panel_account']

    def get_name_guess(self, user):
        if user.first_name or not user.name:
            return None
        return list(split_full_name(user.name))


class MeSerializer(UserSerializer):
    """Self profile: same read-only set as UserSerializer, but the owner
    may edit their own name/photo/bday/phone (never role/approved).

    Telegram fields are read-only here — linking only ever happens through
    the bot with a single-use token (TelegramLinkView), since a writable
    chat id would let anyone point their reset codes at an arbitrary chat.
    Unlinking still works through this endpoint for older cached clients
    that PATCH {telegram_linked: false} (see update())."""

    student = serializers.SerializerMethodField()
    managed_schools = serializers.SerializerMethodField()
    # Dasturchi → Rol: who is looking through this account (common/viewas.py)
    viewing = serializers.SerializerMethodField()

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + [
            'telegram_chat_id', 'username', 'must_change_password', 'student', 'managed_schools', 'viewing',
        ]
        read_only_fields = UserSerializer.Meta.read_only_fields + [
            'telegram_linked', 'telegram_chat_id', 'telegram_username', 'username', 'must_change_password',
        ]

    def get_viewing(self, user):
        by = getattr(user, 'viewed_by', None)
        if by is None:
            return None
        from common.viewas import label

        return {'key': getattr(user, 'view_key', ''), 'label': label(user), 'by': by.name}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if getattr(instance, 'viewed_by', None) is not None:
            # the developer sees the window, not the person's private bits
            data['must_change_password'] = False
            data['telegram_chat_id'] = None
        return data

    def get_managed_schools(self, user):
        """A school's ma'muriyat: which schools they see (schools.SchoolManager)."""
        if not user.is_school_admin:
            return None
        from schools.models import SchoolManager

        return [{'id': m.school_id, 'name': m.school.name, 'position': m.position}
                for m in SchoolManager.objects.filter(user=user).select_related('school').order_by('school__name')]

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

    PROFILE_FIELDS = ('first_name', 'last_name', 'bday', 'phone')

    def validate(self, attrs):
        # A student's name comes from the class roster — renaming
        # themselves would only confuse their teacher's results screens.
        if self.instance is not None and self.instance.is_student:
            for f in ('first_name', 'last_name'):
                attrs.pop(f, None)
            return attrs
        # Touching one's details means giving all that must be there: the
        # first name (one word), the birth date and the phone — the surname
        # may stay empty (accounts/profile.py has the rules).
        if any(f in self.initial_data for f in self.PROFILE_FIELDS):
            current = {f: getattr(self.instance, f) for f in self.PROFILE_FIELDS} if self.instance else {}
            given = {f: attrs.get(f, current.get(f)) for f in self.PROFILE_FIELDS}
            errors, clean = {}, {}
            for f, rule in (('first_name', clean_first_name), ('last_name', clean_last_name),
                            ('bday', clean_bday), ('phone', clean_phone)):
                try:
                    clean[f] = rule(given[f])
                except serializers.ValidationError as exc:
                    errors[f] = exc.detail
            if errors:
                raise serializers.ValidationError(errors)
            attrs.update(clean)
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


