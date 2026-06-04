interface Props {
  pct: number           // 0–100
  size?: number         // px
  strokeWidth?: number
  color?: string        // stroke color
  label: string
  gold?: boolean        // use gold gradient
  subLabel?: string     // extra line shown below label (e.g. actual points)
}

export function RadialGauge({ pct, size = 128, strokeWidth = 8, color = '#004f96', label, gold = false, subLabel }: Props) {
  const clamped = Math.min(Math.max(pct, 0), 100)
  const r = (size / 2) - strokeWidth
  const circumference = 2 * Math.PI * r
  const offset = circumference - (clamped / 100) * circumference
  const gradientId = `gold-grad-${label.replace(/\s+/g, '-')}`

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="rotate-[-90deg]"
          viewBox={`0 0 ${size} ${size}`}
        >
          {gold && (
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#D4AF37" />
                <stop offset="100%" stopColor="#F1D279" />
              </linearGradient>
            </defs>
          )}
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="#e5eeff" strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={gold ? `url(#${gradientId})` : color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span className="text-headline-md font-extrabold text-on-surface tabular-nums">
            {Math.round(clamped)}%
          </span>
        </div>
      </div>
      <p className="label-md font-label-md text-on-surface-variant uppercase tracking-wider text-center">
        {label}
      </p>
      {subLabel && (
        <p className="text-[11px] text-on-surface-variant tabular-nums text-center -mt-1">
          {subLabel}
        </p>
      )}
    </div>
  )
}
