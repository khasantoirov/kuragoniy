"""Obuna tariflari: the plans' prices and contents as the administration
writes them, the contract template and how to pay (owner's mock-ups and
choice, 2026-11-26: "Panelda o'zim kiritaman" — nothing invented here).

GET  /api/schools/offers/            anyone approved (schools read it on
                                     their page; hidden plans only for
                                     administrators)
PUT  /api/schools/offers/            administrators: {plans: [...], payment_note}
POST /api/schools/offers/contract/   administrators: the contract file (PDF/DOC/DOCX)
DELETE the same                      administrators: remove it
"""

from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import notify_admin_action
from common.permissions import IsAdminOrDevSuperuser, IsApproved
from common.uploads import delete_file_field, validate_upload

from .models import PlanOffer, SchoolLicense, SubscriptionInfo

CONTRACT_TYPES = ['.pdf', '.doc', '.docx']
CONTRACT_MAX_MB = 15


class PlanOfferSerializer(serializers.ModelSerializer):
    plan_label = serializers.CharField(source='get_plan_display', read_only=True)

    class Meta:
        model = PlanOffer
        fields = ['plan', 'plan_label', 'price', 'features', 'recommended', 'is_visible', 'updated_at']
        read_only_fields = ['updated_at']


def _offers():
    """One row per plan, in the plans' order (made empty the first time)."""
    for value, _label in SchoolLicense.Plan.choices:
        PlanOffer.objects.get_or_create(plan=value)
    order = [v for v, _ in SchoolLicense.Plan.choices]
    return sorted(PlanOffer.objects.all(), key=lambda o: order.index(o.plan) if o.plan in order else 99)


def _payload(request):
    info = SubscriptionInfo.get()
    admin = request.user.is_admin
    plans = [o for o in _offers() if admin or (o.is_visible and (o.price or o.features))]
    return {
        'plans': PlanOfferSerializer(plans, many=True).data,
        'contract_url': request.build_absolute_uri(info.contract.url) if info.contract else None,
        'contract_name': info.contract.name.rsplit('/', 1)[-1] if info.contract else None,
        'payment_note': info.payment_note,
    }


class OffersView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsApproved()]
        return [IsAdminOrDevSuperuser()]

    def get(self, request):
        return Response(_payload(request))

    def put(self, request):
        rows = request.data.get('plans')
        if rows is not None:
            if not isinstance(rows, list):
                raise serializers.ValidationError({'plans': "Ro'yxat bo'lishi kerak."})
            known = {o.plan: o for o in _offers()}
            for row in rows:
                offer = known.get(str((row or {}).get('plan')))
                if offer is None:
                    raise serializers.ValidationError({'plans': "Noma'lum tarif."})
                s = PlanOfferSerializer(offer, data={k: v for k, v in row.items() if k != 'plan'}, partial=True)
                s.is_valid(raise_exception=True)
                s.save()
        if 'payment_note' in request.data:
            info = SubscriptionInfo.get()
            info.payment_note = str(request.data.get('payment_note') or '')[:2000]
            info.save(update_fields=['payment_note', 'updated_at'])
        notify_admin_action(request.user, "Obuna tariflarini o'zgartirdi")
        return Response(_payload(request))


class ContractView(APIView):
    permission_classes = [IsAdminOrDevSuperuser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        f = request.FILES.get('file')
        if not f:
            return Response({'detail': 'Fayl tanlanmagan.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_upload(f, CONTRACT_TYPES, CONTRACT_MAX_MB)
        except Exception as exc:  # the validator's own message
            return Response({'detail': str(getattr(exc, 'message', exc))}, status=status.HTTP_400_BAD_REQUEST)
        info = SubscriptionInfo.get()
        delete_file_field(info, 'contract')
        info.contract = f
        info.save(update_fields=['contract', 'updated_at'])
        notify_admin_action(request.user, f"Obuna shartnomasi namunasini yukladi: {f.name}")
        return Response(_payload(request))

    def delete(self, request):
        info = SubscriptionInfo.get()
        delete_file_field(info, 'contract')
        info.contract = None
        info.save(update_fields=['contract', 'updated_at'])
        return Response(_payload(request))
