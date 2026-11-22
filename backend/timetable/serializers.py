from rest_framework import serializers

from schools.models import School

from .bells import lesson_times
from .models import SchoolBells, TimetableSlot


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
            # the school's lesson times, when it has them, set the lesson's
            # (timetable/bells.py) — looked up once per school per request
            inst = self.instance if isinstance(self.instance, TimetableSlot) else None
            day = attrs.get('day_index', inst.day_index if inst else None)
            period = attrs.get('period_index', inst.period_index if inst else None)
            if day is not None and period is not None:
                cache = self.context.setdefault('_bells', {})
                sid = attrs['school'].pk
                if sid not in cache:
                    cache[sid] = SchoolBells.objects.filter(school_id=sid).first()
                times = lesson_times(cache[sid], day, period, attrs.get('span', inst.span if inst else 1))
                if times:
                    attrs['time_from'], attrs['time_to'] = times
        return attrs
