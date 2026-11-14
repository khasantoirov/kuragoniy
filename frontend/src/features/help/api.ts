import { useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

/* Yordam markazi (backend helpdesk/). */

export interface FaqItem {
  id: number
  category: string
  category_label: string
  question: string
  answer: string
  order: number
  is_published: boolean
  updated_at: string
}

export type TicketStatus = 'yangi' | 'javob' | 'hal'

export interface Ticket {
  id: number
  author: string
  author_name: string
  author_role: string
  category: string
  category_label: string
  subject: string
  status: TicketStatus
  status_label: string
  page: string
  created_at: string
  updated_at: string
  solved_at: string | null
  messages_count: number
}

export interface TicketMessage {
  id: number
  author: string | null
  author_name: string
  staff: boolean
  body: string
  created_at: string
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[]
}

export const TICKET_TONE: Record<TicketStatus, 'ok' | 'mid' | 'info'> = { yangi: 'mid', javob: 'info', hal: 'ok' }

export function useFaq() {
  return useQuery({
    queryKey: ['help', 'faq'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<{ items: FaqItem[]; categories: { value: string; label: string }[] }>('/help/faq/')).data,
  })
}

export function useTickets(all = false, status = '') {
  return useQuery({
    queryKey: ['help', 'tickets', all, status],
    queryFn: async () => (await api.get<Ticket[]>('/help/tickets/', { params: all ? { all: 1, status } : {} })).data,
  })
}

export function useTicket(id: number | null) {
  return useQuery({
    queryKey: ['help', 'ticket', id],
    enabled: id != null,
    queryFn: async () => (await api.get<TicketDetail>(`/help/tickets/${id}/`)).data,
  })
}

export function useInvalidateHelp() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['help'] })
}
