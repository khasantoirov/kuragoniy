from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import notify_admin_action, notify_user
from common.permissions import IsAdminOrDevSuperuser, IsApproved, IsOversight, IsTeacher

from .models import Order, OrderItem, Product, ShopSettings

MAX_OPEN_ORDERS = 5
MAX_ITEMS = 20


def purchased_product_ids(user) -> set[int]:
    return set(
        OrderItem.objects.filter(order__buyer=user, order__status__in=Order.PAID_STATUSES)
        .values_list('product_id', flat=True)
    )


class ShopSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopSettings
        fields = ['is_open', 'card_number', 'card_holder', 'payment_instructions', 'contact_phone', 'contact_telegram', 'updated_at']
        read_only_fields = ['updated_at']


class ProductSerializer(serializers.ModelSerializer):
    purchased = serializers.SerializerMethodField()
    sales = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = Product
        fields = [
            'id', 'kind', 'delivery', 'title', 'short', 'description', 'grade', 'lesson', 'price', 'old_price',
            'cover_url', 'preview_url', 'content_url', 'content_note', 'stock', 'is_active', 'created_at',
            'updated_at', 'purchased', 'sales',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_purchased(self, obj):
        return obj.id in self.context.get('purchased', set())

    def to_representation(self, obj):
        data = super().to_representation(obj)
        user = self.context['request'].user
        # The paid-for content only goes to buyers (and the admins selling it).
        if not (user.is_admin or obj.id in self.context.get('purchased', set())):
            data['content_url'] = ''
            data['content_note'] = ''
        if not user.is_admin:
            data.pop('sales', None)
        return data

    def validate(self, attrs):
        for f in ('title', 'short'):
            if f in attrs:
                attrs[f] = attrs[f].strip()
        if 'title' in attrs and not attrs['title']:
            raise serializers.ValidationError({'title': 'Nom kerak.'})
        old = attrs.get('old_price')
        price = attrs.get('price', getattr(self.instance, 'price', 0))
        if old is not None and old <= price:
            attrs['old_price'] = None
        if price > 100_000_000:
            raise serializers.ValidationError({'price': "Narx juda katta."})
        return attrs


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsAdminOrDevSuperuser()]

    def get_queryset(self):
        user = self.request.user
        qs = Product.objects.all()
        if not (user.is_admin and self.request.query_params.get('all')):
            qs = qs.filter(is_active=True)
        if user.is_admin:
            qs = qs.annotate(sales=Count('order_items', filter=Q(order_items__order__status__in=Order.PAID_STATUSES)))
        p = self.request.query_params
        if p.get('kind'):
            qs = qs.filter(kind=p['kind'])
        if p.get('grade'):
            qs = qs.filter(grade=p['grade'])
        if p.get('q'):
            qs = qs.filter(Q(title__icontains=p['q']) | Q(short__icontains=p['q']))
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['purchased'] = purchased_product_ids(self.request.user)
        return ctx

    def perform_create(self, serializer):
        product = serializer.save()
        notify_admin_action(self.request.user, f"Do'konga mahsulot qo'shdi: «{product.title}» — {product.price:,} so'm".replace(',', ' '))

    def perform_update(self, serializer):
        product = serializer.save()
        notify_admin_action(self.request.user, f"Mahsulotni tahrirladi: «{product.title}»")

    def perform_destroy(self, instance):
        if instance.order_items.exists():
            # Bought before — keep it for order history, just hide it.
            instance.is_active = False
            instance.save(update_fields=['is_active'])
        else:
            instance.delete()
        notify_admin_action(self.request.user, f"Mahsulotni olib tashladi: «{instance.title}»")


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'title', 'unit_price', 'quantity']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    buyer_name = serializers.CharField(source='buyer.name', read_only=True)
    buyer_phone = serializers.CharField(source='buyer.phone', read_only=True)
    number = serializers.CharField(read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'number', 'buyer', 'buyer_name', 'buyer_phone', 'status', 'total', 'payment_method', 'payment_note',
            'payment_receipt_url', 'phone', 'delivery_address', 'admin_note', 'paid_at', 'created_at', 'updated_at', 'items',
        ]


class OrderCreateSerializer(serializers.Serializer):
    items = serializers.ListField(child=serializers.DictField(), min_length=1, max_length=MAX_ITEMS)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=32)
    delivery_address = serializers.CharField(required=False, allow_blank=True, max_length=500)


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsApproved]

    def get_queryset(self):
        user = self.request.user
        qs = Order.objects.select_related('buyer').prefetch_related('items')
        if user.is_oversight and self.request.query_params.get('all'):
            st = self.request.query_params.get('status')
            return qs.filter(status=st) if st else qs
        return qs.filter(buyer=user)

    def get_object(self):
        obj = get_object_or_404(Order.objects.select_related('buyer').prefetch_related('items'), pk=self.kwargs['pk'])
        user = self.request.user
        if obj.buyer_id != user.id and not user.is_oversight:
            raise PermissionDenied("Bu buyurtma sizniki emas.")
        return obj

    def create(self, request):
        if not IsTeacher().has_permission(request, self):
            raise PermissionDenied("Xarid faqat o'qituvchilar uchun.")
        settings_obj = ShopSettings.get()
        if not settings_obj.is_open:
            raise ValidationError({'detail': "Do'kon vaqtincha yopiq."})
        data = OrderCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        open_orders = Order.objects.filter(buyer=request.user, status__in=[Order.Status.PENDING, Order.Status.REVIEW]).count()
        if open_orders >= MAX_OPEN_ORDERS:
            raise ValidationError({'detail': "To'lanmagan buyurtmalaringiz ko'p. Avval ularni yakunlang yoki bekor qiling."})

        wanted: dict[int, int] = {}
        for row in data.validated_data['items']:
            try:
                pid, qty = int(row.get('product')), int(row.get('quantity', 1))
            except (TypeError, ValueError):
                raise ValidationError({'items': "Mahsulot noto'g'ri."})
            if not 1 <= qty <= 50:
                raise ValidationError({'items': "Miqdor 1–50."})
            wanted[pid] = wanted.get(pid, 0) + qty
        products = {p.id: p for p in Product.objects.filter(id__in=wanted, is_active=True)}
        if len(products) != len(wanted):
            raise ValidationError({'items': "Ba'zi mahsulotlar mavjud emas."})
        owned = purchased_product_ids(request.user)
        for pid, p in products.items():
            if p.delivery == Product.Delivery.DIGITAL:
                if pid in owned:
                    raise ValidationError({'items': f"«{p.title}» allaqachon sotib olingan."})
                wanted[pid] = 1
            elif p.stock is not None and p.stock < wanted[pid]:
                raise ValidationError({'items': f"«{p.title}» omborda yetarli emas."})
        needs_delivery = any(p.delivery == Product.Delivery.PHYSICAL for p in products.values())
        phone = data.validated_data.get('phone', '').strip()
        address = data.validated_data.get('delivery_address', '').strip()
        if needs_delivery and (not phone or not address):
            raise ValidationError({'detail': "Yetkazib berish uchun telefon va manzilni kiriting."})

        # Prices always come from the database, never from the client.
        total = sum(products[pid].price * qty for pid, qty in wanted.items())
        with transaction.atomic():
            order = Order.objects.create(
                buyer=request.user, total=total, phone=phone, delivery_address=address,
                payment_method=Order.Method.FREE if total == 0 else Order.Method.CARD_TRANSFER,
                status=Order.Status.PAID if total == 0 else Order.Status.PENDING,
                paid_at=timezone.now() if total == 0 else None,
            )
            OrderItem.objects.bulk_create([
                OrderItem(order=order, product=products[pid], title=products[pid].title, unit_price=products[pid].price, quantity=qty)
                for pid, qty in wanted.items()
            ])
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='report-payment')
    def report_payment(self, request, pk=None):
        order = self.get_object()
        if order.buyer_id != request.user.id:
            raise PermissionDenied("Bu buyurtma sizniki emas.")
        if order.status not in (Order.Status.PENDING, Order.Status.REVIEW):
            raise ValidationError({'detail': "Bu buyurtma uchun to'lov kutilmayapti."})
        note = str(request.data.get('payment_note') or '').strip()[:500]
        receipt = str(request.data.get('payment_receipt_url') or '').strip()[:500]
        if receipt:
            serializers.URLField().run_validation(receipt)
        if not note and not receipt:
            raise ValidationError({'detail': "To'lov haqida ma'lumot yozing (vaqt, summa, karta oxirgi 4 raqami) yoki chek havolasini qo'shing."})
        order.payment_note, order.payment_receipt_url = note, receipt
        order.status = Order.Status.REVIEW
        order.save(update_fields=['payment_note', 'payment_receipt_url', 'status', 'updated_at'])
        notify_admin_action(request.user, f"Buyurtma {order.number} uchun to'lov qildim deb xabar berdi — {order.total:,} so'm".replace(',', ' '))
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()
        is_owner = order.buyer_id == request.user.id
        if not (is_owner or request.user.is_admin):
            raise PermissionDenied("Ruxsat yo'q.")
        if order.status not in (Order.Status.PENDING, Order.Status.REVIEW):
            raise ValidationError({'detail': "Bu buyurtmani bekor qilib bo'lmaydi."})
        order.status = Order.Status.CANCELLED
        order.admin_note = str(request.data.get('admin_note') or order.admin_note)[:500]
        order.save(update_fields=['status', 'admin_note', 'updated_at'])
        if not is_owner:
            notify_user(order.buyer, f"Buyurtma {order.number} bekor qilindi." + (f" Izoh: {order.admin_note}" if order.admin_note else ''))
        return Response(OrderSerializer(order).data)

    def _admin(self, request):
        if not request.user.is_admin:
            raise PermissionDenied("Faqat administrator uchun.")

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Admin confirms the money arrived — the buyer gets access."""
        self._admin(request)
        with transaction.atomic():
            order = self.get_object()
            if order.status not in (Order.Status.PENDING, Order.Status.REVIEW):
                raise ValidationError({'detail': "Buyurtma holati tasdiqlashga mos emas."})
            for item in order.items.select_related('product'):
                p = item.product
                if p.delivery == Product.Delivery.PHYSICAL and p.stock is not None:
                    updated = Product.objects.filter(pk=p.pk, stock__gte=item.quantity).update(stock=F('stock') - item.quantity)
                    if not updated:
                        raise ValidationError({'detail': f"«{p.title}» omborda yetarli emas."})
            order.status = Order.Status.PAID
            order.paid_at = timezone.now()
            order.confirmed_by = request.user
            order.admin_note = str(request.data.get('admin_note') or order.admin_note)[:500]
            order.save(update_fields=['status', 'paid_at', 'confirmed_by', 'admin_note', 'updated_at'])
        notify_user(order.buyer, f"✅ Buyurtma {order.number} to'lovi tasdiqlandi. Xaridlaringiz «Do'kon → Xaridlarim» bo'limida.")
        notify_admin_action(request.user, f"Buyurtma {order.number} to'lovini tasdiqladi — {order.buyer.name}, {order.total:,} so'm".replace(',', ' '))
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def deliver(self, request, pk=None):
        self._admin(request)
        order = self.get_object()
        if order.status != Order.Status.PAID:
            raise ValidationError({'detail': "Avval to'lov tasdiqlansin."})
        order.status = Order.Status.DELIVERED
        order.save(update_fields=['status', 'updated_at'])
        notify_user(order.buyer, f"📦 Buyurtma {order.number} yetkazildi.")
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        self._admin(request)
        order = self.get_object()
        if order.status not in Order.PAID_STATUSES:
            raise ValidationError({'detail': "Faqat to'langan buyurtma qaytariladi."})
        order.status = Order.Status.REFUNDED
        order.admin_note = str(request.data.get('admin_note') or order.admin_note)[:500]
        order.save(update_fields=['status', 'admin_note', 'updated_at'])
        notify_admin_action(request.user, f"Buyurtma {order.number} pulini qaytardi — {order.buyer.name}")
        return Response(OrderSerializer(order).data)


class ShopSettingsView(APIView):
    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsAdminOrDevSuperuser()]

    def get(self, request):
        return Response(ShopSettingsSerializer(ShopSettings.get()).data)

    def put(self, request):
        obj = ShopSettings.get()
        s = ShopSettingsSerializer(obj, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        notify_admin_action(request.user, "Do'kon sozlamalarini o'zgartirdi")
        return Response(s.data)


class PurchasesView(APIView):
    """Everything this teacher has paid for, with the content links."""

    permission_classes = [IsApproved]

    def get(self, request):
        items = (
            OrderItem.objects.filter(order__buyer=request.user, order__status__in=Order.PAID_STATUSES)
            .select_related('product', 'order').order_by('-order__paid_at')
        )
        seen, out = set(), []
        for it in items:
            if it.product_id in seen:
                continue
            seen.add(it.product_id)
            p = it.product
            out.append({
                'product': p.id, 'title': p.title, 'kind': p.kind, 'delivery': p.delivery, 'cover_url': p.cover_url,
                'content_url': p.content_url, 'content_note': p.content_note, 'order': it.order.number,
                'order_status': it.order.status, 'paid_at': it.order.paid_at,
            })
        return Response(out)


class ShopStatsView(APIView):
    permission_classes = [IsOversight]

    def get(self, request):
        paid = Order.objects.filter(status__in=Order.PAID_STATUSES)
        by_month = (
            paid.annotate(m=TruncMonth('paid_at')).values('m').annotate(revenue=Sum('total'), orders=Count('id')).order_by('m')
        )
        top = (
            OrderItem.objects.filter(order__status__in=Order.PAID_STATUSES)
            .values('product', 'title').annotate(qty=Sum('quantity'), revenue=Sum(F('unit_price') * F('quantity')))
            .order_by('-revenue')[:10]
        )
        return Response({
            'revenue': paid.aggregate(s=Sum('total'))['s'] or 0,
            'orders_paid': paid.count(),
            'buyers': paid.values('buyer').distinct().count(),
            'by_status': dict(Order.objects.values('status').annotate(n=Count('id')).values_list('status', 'n')),
            'by_month': [{'month': r['m'].date().isoformat() if r['m'] else None, 'revenue': r['revenue'], 'orders': r['orders']}
                         for r in by_month],
            'top_products': list(top),
        })
