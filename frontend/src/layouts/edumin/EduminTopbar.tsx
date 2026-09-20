import type { ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'

import { GlobalSearch } from '@/features/search/GlobalSearch'

/** 2-rejim yuqori paneli: markazda haqiqiy ishlaydigan qidiruv, o'ngda
 *  amallar. `barRef` AppShell'ning ResizeObserver'iga uzatiladi — `--topbar-h`
 *  shu element balandligi bo'yicha o'lchanadi, aks holda ostidagi yopishqoq
 *  jadval sarlavhalari noto'g'ri joyda turadi.
 *
 *  Desktopda brend yon menyuda turadi, shuning uchun `.edtop__brand` faqat
 *  tor ekranlarda ko'rinadi (CSS orqali). */
export function EduminTopbar({ barRef, onNav, children }: {
  barRef: Ref<HTMLElement>
  onNav: () => void
  children: ReactNode
}) {
  return (
    <header className="edtop" ref={barRef}>
      <div className="edtop__inner">
        <Link className="edtop__brand" to="/" onClick={onNav}>
          <img className="edtop__logo" src="/logo.png" alt="KO'RAGONIY EDU" width={38} height={38} />
          <span className="edtop__bt">KO'RAGONIY EDU</span>
        </Link>

        <GlobalSearch />

        <div className="edtop__acts">{children}</div>
      </div>
    </header>
  )
}
