from rest_framework import serializers

from .models import TimetableSlot


class TimetableSlotSerializer(serializers.ModelSerializer):
    # Plain HH:MM — the UI never shows/edits seconds, so there's no reason
    # for the API to round-trip DRF's default HH:MM:SS.
    time_from = serializers.TimeField(format='%H:%M', required=False, allow_null=True)
    time_to = serializers.TimeField(format='%H:%M', required=False, allow_null=True)

    class Meta:
        model = TimetableSlot
        fields = [
            'id', 'day_index', 'period_index', 'time_from', 'time_to',
            'maktab', 'xona', 'sinf', 'span', 'band',
        ]
