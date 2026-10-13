import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

export type ProductKind = 'ishlanma' | 'tajriba' | 'toplam' | 'jihoz' | 'boshqa'

export interface Product {
  id: number
  kind: ProductKind
  delivery: 'digital' | 'physical'
  title: string
  short: string
  description: string
  grade: number | null
  lesson: number | null
  price: number
  old_price: number | null
  cover_url: string
  preview_url: string
  content_url: string
  content_note: string
  stock: number | null
  is_active: boolean
  purchased: boolean
  sales?: number | null
}

export interface Order {
  id: number
  number: string
  buyer: string
  buyer_name: string
  buyer_phone: string
  status: 'pending' | 'review' | 'paid' | 'delivered' | 'cancelled' | 'refunded'
  total: number
  payment_method: string
  payment_note: string
  payment_receipt_url: string
  phone: string
  delivery_address: string
  admin_note: string
  paid_at: string | null
  created_at: string
  items: { id: number; product: number; title: string; unit_price: number; quantity: number }[]
}

export interface ShopSettings {
  is_open: boolean
  card_number: string
  card_holder: string
  payment_instructions: string
  contact_phone: string
  contact_telegram: string
}

export interface Purchase {
  product: number
  title: string
  kind: ProductKind
  delivery: string
  cover_url: string
  content_url: string
  content_note: string
  order: string
  order_status: string
  paid_at: string
}

export const KIND_LABEL: Record<ProductKind, string> = {
  ishlanma: 'Dars ishlanmasi',
  tajriba: "Tajriba qo'llanmasi",
  toplam: "To'plam",
  jihoz: 'Tajriba jihozlari',
  boshqa: 'Boshqa',
}

export const ORDER_STATUS: Record<Order['status'], { label: string; tone: 'ok' | 'mid' | 'bad' | 'info' | 'muted' }> = {
  pending: { label: "To'lov kutilmoqda", tone: 'mid' },
  review: { label: "To'lov tekshirilmoqda", tone: 'info' },
  paid: { label: "To'langan", tone: 'ok' },
  delivered: { label: 'Yetkazildi', tone: 'ok' },
  cancelled: { label: 'Bekor qilingan', tone: 'muted' },
  refunded: { label: 'Qaytarilgan', tone: 'bad' },
}

export function useProducts(params: Record<string, string | number | undefined> = {}) {
  return useQuery({
    queryKey: ['shop', 'products', params],
    queryFn: async () => (await api.get<Paginated<Product>>('/shop/products/', { params })).data.results,
  })
}

export function useShopSettings() {
  return useQuery({ queryKey: ['shop', 'settings'], queryFn: async () => (await api.get<ShopSettings>('/shop/settings/')).data })
}

export function useOrders(params: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: ['shop', 'orders', params],
    queryFn: async () => (await api.get<Paginated<Order>>('/shop/orders/', { params })).data.results,
  })
}

export function usePurchases() {
  return useQuery({ queryKey: ['shop', 'purchases'], queryFn: async () => (await api.get<Purchase[]>('/shop/purchases/')).data })
}

/** Cart lives in the browser only (a per-viewer convenience) — prices are
 * always recomputed by the server when the order is placed. */
interface CartState {
  items: Record<number, number>
  add: (id: number, qty?: number) => void
  setQty: (id: number, qty: number) => void
  remove: (id: number) => void
  clear: () => void
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: {},
      add: (id, qty = 1) => set((s) => ({ items: { ...s.items, [id]: (s.items[id] ?? 0) + qty } })),
      setQty: (id, qty) => set((s) => ({ items: { ...s.items, [id]: Math.max(1, Math.min(50, qty)) } })),
      remove: (id) => set((s) => {
        const items = { ...s.items }
        delete items[id]
        return { items }
      }),
      clear: () => set({ items: {} }),
    }),
    { name: 'af-cart' },
  ),
)
