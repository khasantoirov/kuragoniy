from rest_framework import serializers

from .matching import norm, school_keys
from .models import School


class SchoolBriefSerializer(serializers.ModelSerializer):
    """What any staff member sees (e.g. the journal's school picker)."""

    class Meta:
        model = School
        fields = ['id', 'name', 'district', 'is_active']


class SchoolSerializer(serializers.ModelSerializer):
    teachers_count = serializers.IntegerField(read_only=True, default=0)
    classes_count = serializers.IntegerField(read_only=True, default=0)
    students_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = School
        fields = [
            'id', 'name', 'district', 'address', 'director', 'phone', 'contract_start', 'contract_end', 'is_active',
            'aliases', 'notes', 'created_at', 'updated_at', 'teachers_count', 'classes_count', 'students_count',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate_name(self, value):
        value = ' '.join(str(value).split())
        if not value:
            raise serializers.ValidationError("Maktab nomini kiriting.")
        return value

    def validate_aliases(self, value):
        if not isinstance(value, list) or len(value) > 30:
            raise serializers.ValidationError("Ko'pi bilan 30 ta muqobil nom.")
        out = []
        for a in value:
            a = ' '.join(str(a).split())[:200]
            if a and norm(a) not in {norm(x) for x in out}:
                out.append(a)
        return out

    def validate(self, attrs):
        # A spelling may belong to one school only — otherwise matching
        # (and every per-school number) would be ambiguous.
        name = attrs.get('name', getattr(self.instance, 'name', ''))
        aliases = attrs.get('aliases', getattr(self.instance, 'aliases', []) or [])
        mine = {norm(name)} | {norm(a) for a in aliases}
        others = School.objects.exclude(pk=self.instance.pk) if self.instance else School.objects.all()
        for other in others:
            clash = mine & school_keys(other)
            if clash:
                raise serializers.ValidationError(
                    {'aliases': f"«{sorted(clash)[0]}» nomi allaqachon «{other.name}» maktabiga tegishli."})
        return attrs
