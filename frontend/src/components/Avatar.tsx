function initials(name: string) {
  return (name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export function Avatar({ name, photo, className = 'acct__av' }: { name: string; photo?: string | null; className?: string }) {
  if (photo) {
    return <img className={`${className} ${className}--img`} src={photo} alt={name} />
  }
  return <span className={className}>{initials(name)}</span>
}
