interface ArcGaugeProps {
  pct: number      // 0–100
  size?: number    // diameter in px
}

export function ArcGauge({ pct, size = 160 }: ArcGaugeProps) {
  const clamped  = Math.min(Math.max(pct, 0), 100)
  const sw       = 14
  const r        = size / 2 - sw - 2
  const cx       = size / 2
  const cy       = size / 2
  const C        = 2 * Math.PI * r
  const arcLen   = C / 2                          // 180° top-semicircle
  const progressLen = (clamped / 100) * arcLen

  // SVG height: show from top of arc (cy-r-sw/2) down past the centre endcaps (cy+sw/2)
  const svgH = Math.ceil(cy + sw / 2 + 6)

  const rotateCtr = `${cx}px ${cy}px`

  return (
    <div className="relative" style={{ width: size, height: svgH }}>
      <svg
        width={size}
        height={svgH}
        viewBox={`0 0 ${size} ${svgH}`}
        style={{ overflow: 'hidden' }}
      >
        {/* Track – top semicircle only */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#e5eeff"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${arcLen}`}
          style={{ transform: 'rotate(180deg)', transformOrigin: rotateCtr }}
        />
        {/* Progress – fills from 9-o'clock CW */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#990000"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${C} ${C}`}
          strokeDashoffset={C - progressLen}
          style={{
            transform: 'rotate(180deg)',
            transformOrigin: rotateCtr,
            transition: 'stroke-dashoffset 0.8s ease-out',
          }}
        />
        {/* 100 % target tick at top */}
        <line
          x1={cx} y1={cy - r - sw / 2 - 3}
          x2={cx} y2={cy - r - sw / 2 - 9}
          stroke="#c7d2fe" strokeWidth={2} strokeLinecap="round"
        />
      </svg>

      {/* Percentage label anchored at the endcap line */}
      <div
        className="absolute left-0 right-0 flex justify-center"
        style={{ bottom: 4 }}
      >
        <span className="text-[22px] font-extrabold text-primary tabular-nums leading-none">
          {Math.round(clamped)}%
        </span>
      </div>
    </div>
  )
}
