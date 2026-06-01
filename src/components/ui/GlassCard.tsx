import { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  hover?: boolean
  elevated?: boolean
  onClick?: () => void
}

export function GlassCard({ children, className = '', hover = false, elevated = false, onClick }: Props) {
  const base = elevated
    ? 'bg-white/80 backdrop-blur-[40px] border-t border-l border-white shadow-glass-elevated'
    : 'bg-white/60 backdrop-blur-[20px] border border-white/50 border-t-white/80 border-l-white/80 shadow-glass'
  const hoverClass = hover ? 'hover:bg-white/85 hover:-translate-y-0.5 hover:shadow-glass-hover transition-all duration-200' : ''
  const cursorClass = onClick ? 'cursor-pointer' : ''
  return (
    <div className={`rounded-xl ${base} ${hoverClass} ${cursorClass} ${className}`} onClick={onClick}>
      {children}
    </div>
  )
}
