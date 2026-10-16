import { Fragment, type ReactNode } from 'react'

/**
 * Renders the plain-text formula syntax admins type ("F = m*a",
 * "E_k = m*v^2/2", "sqrt(2*g*h)") with real super/subscripts and a
 * multiplication dot — no LaTeX to learn, no math library to download.
 *
 *   x^2, x^{-1}  -> superscript      v_0, E_{k}  -> subscript
 *   *            -> ·                sqrt(...)   -> √(...)
 *   alpha/beta/… -> Greek letters    deg         -> °
 */
const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', eta: 'η', theta: 'θ', lambda: 'λ',
  mu: 'μ', nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Omega: 'Ω',
}

function prettify(s: string): string {
  return s
    .replace(/sqrt/g, '√')
    .replace(/\*/g, '·')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/\bdeg\b/g, '°')
    .replace(/\b(alpha|beta|gamma|delta|Delta|epsilon|eta|theta|lambda|mu|nu|pi|rho|sigma|tau|phi|omega|Omega)\b/g, (m) => GREEK[m])
}

export function Formula({ expr }: { expr: string }) {
  const out: ReactNode[] = []
  let i = 0
  let buf = ''
  const flush = () => {
    if (buf) out.push(<Fragment key={out.length}>{prettify(buf)}</Fragment>)
    buf = ''
  }
  while (i < expr.length) {
    const ch = expr[i]
    if ((ch === '^' || ch === '_') && i + 1 < expr.length) {
      flush()
      let token = ''
      if (expr[i + 1] === '{') {
        const end = expr.indexOf('}', i + 2)
        token = end === -1 ? expr.slice(i + 2) : expr.slice(i + 2, end)
        i = end === -1 ? expr.length : end + 1
      } else {
        const m = /^-?[A-Za-z0-9.]+/.exec(expr.slice(i + 1))
        token = m ? m[0] : expr[i + 1]
        i += 1 + token.length
      }
      out.push(ch === '^' ? <sup key={out.length}>{prettify(token)}</sup> : <sub key={out.length}>{prettify(token)}</sub>)
      continue
    }
    buf += ch
    i++
  }
  flush()
  return <span className="formula">{out}</span>
}
