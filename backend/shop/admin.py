from django.contrib import admin

from .models import Order, OrderItem, Product, ShopSettings


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('title', 'kind', 'price', 'is_active')
    list_filter = ('kind', 'is_active')


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'buyer', 'status', 'total', 'created_at')
    list_filter = ('status',)
    inlines = [OrderItemInline]


admin.site.register(ShopSettings)
