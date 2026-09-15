import { type ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'btn--primary',
  secondary: '',
  ghost: 'btn--ghost',
  danger: 'btn--danger',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm'
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'secondary', size, className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`btn ${VARIANT_CLASSES[variant]} ${size === 'sm' ? 'btn--sm' : ''} ${className}`}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
