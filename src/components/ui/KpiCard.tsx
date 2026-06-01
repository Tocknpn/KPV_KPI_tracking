import { ReactNode } from 'react'
import { GlassCard } from './GlassCard'

interface Props {
  label: string
  value: string
  unit?: string
  delta?: number | null      // % change, positive = up, negative = down
  deltaLabel?: string
  icon: ReactNode
  iconBg: string             // tailwind bg class e.g. "bg-secondary-container"
  accentColor: string        // tailwind color class for bottom bar e.g. "bg-secondary"
  barWidth?: string          // e.g. "85%"
}

export function KpiCard({ label, value, unit, delta, deltaLabel, icon, iconBg, accentColor, barWidth = '70%' }: Props) {
  const isUp = delta !== null && delta !== undefined && delta >= 0

  return (
    <GlassCard hover className="p-6 relative overflow-hidden group">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-1">
            {label}
          </p>
          <h3 className="font-display-xl text-display-xl font-bold tabular-nums text-on-surface leading-tight">
            {value}
            {unit && (
              <span className="text-headline-md font-medium text-on-surface-variant ml-1">{unit}</span>
            )}
          </h3>
        </div>
        <div className={`p-3 ${iconBg} rounded-lg text-on-secondary-container`}>
          {icon}
        </div>
      </div>
      {delta !== null && delta !== undefined && (
        <div className="flex items-center gap-2">
          <span className={`font-bold flex items-center text-body-sm ${isUp ? 'text-tertiary' : 'text-error'}`}>
            <span className="material-symbols-outlined text-sm mr-0.5">
              {isUp ? 'trending_up' : 'trending_down'}
            </span>
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-on-surface-variant text-body-sm font-label-md">
            {deltaLabel ?? 'vs last month'}
          </span>
        </div>
      )}
      {/* Bottom accent bar */}
      <div
        className={`absolute bottom-0 left-0 h-1 ${accentColor} group-hover:opacity-80 transition-all duration-700`}
        style={{ width: barWidth }}
      />
    </GlassCard>
  )
}
