export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  )
}
