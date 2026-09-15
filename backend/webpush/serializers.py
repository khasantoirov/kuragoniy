from rest_framework import serializers


class PushSubscriptionSerializer(serializers.Serializer):
    """Matches the shape of PushSubscription.toJSON() from the browser's
    Push API — not a ModelSerializer since the wire format nests the keys
    under `keys` while the model stores them as flat columns."""

    endpoint = serializers.URLField(max_length=500)
    keys = serializers.DictField(child=serializers.CharField())

    def validate_keys(self, value):
        if 'p256dh' not in value or 'auth' not in value:
            raise serializers.ValidationError("p256dh va auth kalitlari kerak.")
        return value
