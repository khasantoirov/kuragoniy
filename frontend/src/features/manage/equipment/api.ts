import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'

import type { CatalogEntry, Kind, RegItem, Registry } from './registry'

const KEY = ['equipment-registry']

export function useRegistry() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Registry>('/lessons/equipment-registry/')).data,
  })
}

/** Patch the cached registry in place instead of refetching ~800 rows
 * after every cell edit. */
function useCache() {
  const qc = useQueryClient()
  return (fn: (r: Registry) => Registry) => qc.setQueryData<Registry>(KEY, (r) => (r ? fn(r) : r))
}

export function useUpsertEquipment() {
  const patch = useCache()
  return useMutation({
    mutationFn: async (body: { name: string; kind?: Kind; build_materials?: string; price?: number | null }) =>
      (await api.post<CatalogEntry>('/lessons/lab-equipment/upsert/', body)).data,
    onSuccess: (entry) => patch((r) => ({ ...r, catalog: { ...r.catalog, [entry.key]: entry } })),
  })
}

export function useEquipmentImage() {
  const patch = useCache()
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File | null }) => {
      if (!file) return (await api.post<CatalogEntry>(`/lessons/lab-equipment/${id}/remove-image/`)).data
      const form = new FormData()
      form.append('image', file)
      return (await api.post<CatalogEntry>(`/lessons/lab-equipment/${id}/upload-image/`, form)).data
    },
    onSuccess: (entry) => patch((r) => ({ ...r, catalog: { ...r.catalog, [entry.key]: entry } })),
  })
}

/** Name/quantity of one experiment's item; the key is recomputed on the
 * server, so the whole registry is refetched after a rename. */
export function useUpdateItem() {
  const qc = useQueryClient()
  const patch = useCache()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; name?: string; quantity?: number }) =>
      (await api.patch<RegItem>(`/lessons/equipment-items/${id}/`, body)).data,
    onSuccess: (item, vars) => {
      if (vars.name !== undefined) {
        void qc.invalidateQueries({ queryKey: KEY })
        return
      }
      patch((r) => ({
        ...r,
        lessons: r.lessons.map((l) => ({
          ...l,
          experiments: l.experiments.map((e) => ({
            ...e,
            items: e.items.map((i) => (i.id === vars.id ? { ...i, quantity: item.quantity } : i)),
          })),
        })),
      }))
    },
  })
}
