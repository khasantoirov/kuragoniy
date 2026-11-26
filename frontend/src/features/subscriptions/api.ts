import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

/* Obuna tariflari (backend schools/offers.py): the administration's own
   prices and contents per plan, the contract template, how to pay. */

export type PlanCode = 'sinov' | 'standart' | 'premium'

export interface PlanOffer {
  plan: PlanCode
  plan_label: string
  price: string
  features: string
  recommended: boolean
  is_visible: boolean
}

export interface Offers {
  plans: PlanOffer[]
  contract_url: string | null
  contract_name: string | null
  payment_note: string
}

const KEY = ['schools', 'offers']

export function useOffers() {
  return useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Offers>('/schools/offers/')).data })
}

export function useSaveOffers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { plans?: Partial<PlanOffer>[]; payment_note?: string }) => (await api.put<Offers>('/schools/offers/', body)).data,
    onSuccess: (data) => qc.setQueryData(KEY, data),
  })
}

export function useContract() {
  const qc = useQueryClient()
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return (await api.post<Offers>('/schools/offers/contract/', fd)).data
    },
    onSuccess: (data) => qc.setQueryData(KEY, data),
  })
  const remove = useMutation({
    mutationFn: async () => (await api.delete<Offers>('/schools/offers/contract/')).data,
    onSuccess: (data) => qc.setQueryData(KEY, data),
  })
  return { upload, remove }
}
