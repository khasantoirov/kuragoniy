import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { fmtDate } from '@/features/portal/ui'
import { IC } from '@/icons'
import { printPage } from '@/lib/protection'

import { useCertificate, type Certificate } from './api'
import { ORG, verifyUrl } from './cert'

/** The course certificate — the same sheet as Rag'batlantirish's, printed
 * by the browser (any script prints, unlike a PDF library's fonts). */
export function CertificateSheet({ cert }: { cert: Certificate }) {
  const { t } = useTranslation()
  return (
    <div className="cert cert--course printable">
      <img className="cert__logo" src="/logo.png" alt="" />
      <p className="cert__org">{ORG}</p>
      <img className="cert__sign" src="/muhandis-d-on-light.png" alt="Muhandis D" />
      <h2 className="cert__h">{t('SERTIFIKAT')}</h2>
      <p className="cert__to">{t('Ushbu sertifikat')}</p>
      <p className="cert__name">{cert.name}</p>
      <p className="cert__title">«{cert.course_title}»</p>
      <p className="cert__reason">{t('malaka oshirish kursini muvaffaqiyatli tamomlaganini tasdiqlaydi.')}</p>
      <p className="cert__meta">
        {cert.hours > 0 && <span>{cert.hours} {t('soat')}</span>}
        <span>{t('Yakuniy natija')}: {Math.round(cert.percent)}%</span>
      </p>
      <div className="cert__foot">
        <span>{fmtDate(cert.issued_at)}</span>
        <span>№ {cert.number}</span>
        <span className="cert__verify">{t('Tekshirish')}: {verifyUrl(cert.code).replace(/^https?:\/\//, '')}</span>
      </div>
    </div>
  )
}

export function CertificateModal({ id, cert, onClose }: { id?: number; cert?: Certificate; onClose: () => void }) {
  const { t } = useTranslation()
  const q = useCertificate(cert ? null : id ?? null)
  const shown = cert ?? q.data
  return (
    <Modal title={t('Sertifikat')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Yopish')}</button>
        <button className="btn btn--primary" disabled={!shown} onClick={printPage}>{IC.print} {t('Chop etish / PDF')}</button></>}>
      {shown ? <CertificateSheet cert={shown} /> : q.isError ? <p className="form__note form__note--err">{t('Sertifikat topilmadi.')}</p> : <Skeleton lines={6} />}
    </Modal>
  )
}
