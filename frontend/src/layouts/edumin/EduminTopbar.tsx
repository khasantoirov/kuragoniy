import type { ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'

import { GlobalSearch } from '@/features/search/GlobalSearch'
import { usePageScrolled } from '@/lib/scroll'

import { BrandMark } from './BrandMark'
import { SidebarToggle } from './Sidebar'

/** 2-rejim yuqori paneli: ≡ menyu tugmasi (desktopda yon menyuni yig'adi,
 *  tor ekranda uni tortma sifatida ochadi), markazda haqiqiy ishlaydigan
 *  qidiruv, o'ngda amallar. Sahifa pastga aylantirilganda panel ostiga
 *  yumshoq soya tushadi. `barRef` AppShell'ning ResizeObserver'iga
 *  uzatiladi — `--topbar-h` shu element balandligi bo'yicha o'lchanadi,
 *  aks holda ostidagi yopishqoq jadval sarlavhalari noto'g'ri joyda turadi.
 *
 *  Desktopda brend yon menyuda turadi, shuning uchun `.edtop__brand` faqat
 *  tor ekranlarda ko'rinadi (CSS orqali). */
export function EduminTopbar({ barRef, onNav, children }: {
  barRef: Ref<HTMLElement>
  onNav: () => void
  children: ReactNode
}) {
  const scrolled = usePageScrolled(4)
  return (
    <header className={`edtop ${scrolled ? 'is-scrolled' : ''}`} ref={barRef}>
      <div className="edtop__inner">
        <SidebarToggle />
        <Link className="edtop__brand" to="/" onClick={onNav}>
          <img className="edtop__logo" src="/logo.png" alt="KO'RAGONIY" width={44} height={44} />
          <BrandMark />
        </Link>

        <GlobalSearch />

        <div className="edtop__acts">{children}</div>
      </div>
    </header>
  )
}
