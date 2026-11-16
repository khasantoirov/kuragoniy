from rest_framework import serializers

from schools.models import School

from .models import TimetableSlot


class TimetableSlotSerializer(serializers.ModelSerializer):
    # Plain HH:MM — the UI never shows/edits seconds, so there's no reason
    # for the API to round-trip DRF's default HH:MM:SS.
    time_from = serializers.TimeField(format='%H:%M', required=False, allow_null=True)
    time_to = serializers.TimeField(format='%H:%M', required=False, allow_null=True)
    # picked from the partner schools; its name becomes `maktab`
    school = serializers.PrimaryKeyRelatedField(queryset=School.objects.all(), required=False, allow_null=True)

    class Meta:
        model = TimetableSlot
        fields = [
            'id', 'day_index', 'period_index', 'time_from', 'time_to',
            'school', 'maktab', 'xona', 'sinf', 'span', 'band',
        ]

    def validate(self, attrs):
        # "band" (busy elsewhere) names any place in free text, never a school
        if attrs.get('band'):
            attrs['school'] = None
        elif attrs.get('school'):
            attrs['maktab'] = attrs['school'].name
        return attrs
