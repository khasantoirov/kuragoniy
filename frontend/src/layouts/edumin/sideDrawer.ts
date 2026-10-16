import { create } from 'zustand'

/** Narrow screens: the side menu is a drawer opened from the topbar's ≡
 * button (not persisted — it always starts closed). */
export const useSideDrawer = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
