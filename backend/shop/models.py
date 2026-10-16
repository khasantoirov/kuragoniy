"""Shop for teachers: lesson plans (dars ishlanmalari), experiment guides
and kits. The platform (admins) sells; teachers buy.

Payment today is a card transfer the buyer reports and an admin confirms
(no merchant account yet); Order.payment_method already has room for
Payme/Click so a provider callback can later flip an order to PAID the
same way confirm() does. Digital content is an external link (Drive etc.)
revealed only to buyers of a paid order — nothing is stored on the server.
"""

from django.conf import settings
from django.db import models

from learning.models import GRADE_CHOICES


class ShopSettings(models.Model):
    """Singleton (pk=1) — what buyers see on the payment step."""

    is_open = models.BooleanField(default=True)
    card_number = models.CharField(max_length=32, blank=True)
    card_holder = models.CharField(max_length=100, blank=True)
    payment_instructions = models.TextField(blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    contact_telegram = models.CharField(max_length=64, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class Product(models.Model):
    class Kind(models.TextChoices):
        ISHLANMA = 'ishlanma', 'Dars ishlanmasi'
        TAJRIBA = 'tajriba', "Tajriba qo'llanmasi"
        TOPLAM = 'toplam', "To'plam"
        JIHOZ = 'jihoz', "Tajriba jihozi (to'plam)"
        BOSHQA = 'boshqa', 'Boshqa'

    class Delivery(models.TextChoices):
        DIGITAL = 'digital', 'Elektron'
        PHYSICAL = 'physical', 'Jismoniy (yetkazib beriladi)'

    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.ISHLANMA)
    delivery = models.CharField(max_length=10, choices=Delivery.choices, default=Delivery.DIGITAL)
    title = models.CharField(max_length=200)
    short = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True)
    grade = models.CharField(max_length=5, choices=GRADE_CHOICES, null=True, blank=True)
    lesson = models.ForeignKey('lessons.Lesson', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    price = models.PositiveIntegerField(default=0)  # so'm
    old_price = models.PositiveIntegerField(null=True, blank=True)
    cover_url = models.URLField(max_length=500, blank=True)
    preview_url = models.URLField(max_length=500, blank=True)  # free sample, public
    # Secret until purchased:
    content_url = models.URLField(max_length=500, blank=True)
    content_note = models.TextField(blank=True)
    stock = models.PositiveIntegerField(null=True, blank=True)  # physical only; null = unlimited
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['is_active', 'kind'])]

    def __str__(self):
        return self.title


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', "To'lov kutilmoqda"
        REVIEW = 'review', "To'lov tekshirilmoqda"
        PAID = 'paid', "To'langan"
        DELIVERED = 'delivered', 'Yetkazildi'
        CANCELLED = 'cancelled', 'Bekor qilingan'
        REFUNDED = 'refunded', 'Qaytarilgan'

    class Method(models.TextChoices):
        CARD_TRANSFER = 'card_transfer', "Karta orqali o'tkazma"
        PAYME = 'payme', 'Payme'
        CLICK = 'click', 'Click'
        CASH = 'cash', 'Naqd'
        FREE = 'free', 'Bepul'

    PAID_STATUSES = (Status.PAID, Status.DELIVERED)

    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='orders', on_delete=models.PROTECT)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    total = models.PositiveIntegerField(default=0)
    payment_method = models.CharField(max_length=16, choices=Method.choices, default=Method.CARD_TRANSFER)
    payment_note = models.CharField(max_length=500, blank=True)
    payment_receipt_url = models.URLField(max_length=500, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    delivery_address = models.CharField(max_length=500, blank=True)
    admin_note = models.CharField(max_length=500, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True, on_delete=models.SET_NULL,
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['buyer', '-created_at']), models.Index(fields=['status'])]

    @property
    def number(self):
        return f'AF-{self.created_at:%y%m}-{self.pk:05d}' if self.pk and self.created_at else ''

    @property
    def needs_delivery(self):
        return self.items.filter(product__delivery=Product.Delivery.PHYSICAL).exists()


class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name='order_items', on_delete=models.PROTECT)
    title = models.CharField(max_length=200)  # snapshot at purchase time
    unit_price = models.PositiveIntegerField()
    quantity = models.PositiveSmallIntegerField(default=1)

    @property
    def line_total(self):
        return self.unit_price * self.quantity
