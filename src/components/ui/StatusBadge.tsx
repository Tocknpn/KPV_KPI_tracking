type Variant = 'success' | 'warning' | 'error' | 'neutral' | 'gold' | 'info'

const variants: Record<Variant, string> = {
  success: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  warning: 'bg-secondary-fixed text-on-secondary-fixed-variant',
  error:   'bg-error-container text-on-error-container',
  neutral: 'bg-surface-container-highest text-on-surface-variant',
  gold:    'bg-secondary-container text-on-secondary-container',
  info:    'bg-primary-fixed text-on-primary-fixed-variant',
}

interface Props {
  label: string
  variant?: Variant
  className?: string
}

export function StatusBadge({ label, variant = 'neutral', className = '' }: Props) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${variants[variant]} ${className}`}>
      {label}
    </span>
  )
}
