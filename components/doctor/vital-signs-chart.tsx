/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import type { VitalDataPoint } from "@/hooks/outpatient/use-patient-history"

// ---------------------------------------------------------------------------
// Metric configuration
// ---------------------------------------------------------------------------

interface MetricConfig {
  key: keyof Omit<VitalDataPoint, "date">
  label: string
  unit: string
  color: string       // HSL for canvas
  colorClass: string  // Tailwind class for buttons
}

const METRICS: MetricConfig[] = [
  { key: "systolic_bp", label: "Sistolik", unit: "mmHg", color: "hsl(0, 80%, 55%)", colorClass: "bg-red-500" },
  { key: "diastolic_bp", label: "Diastolik", unit: "mmHg", color: "hsl(340, 70%, 50%)", colorClass: "bg-pink-500" },
  { key: "heart_rate", label: "Nadi", unit: "bpm", color: "hsl(280, 70%, 55%)", colorClass: "bg-purple-500" },
  { key: "temperature", label: "Suhu", unit: "°C", color: "hsl(30, 90%, 50%)", colorClass: "bg-orange-500" },
  { key: "weight_kg", label: "BB", unit: "kg", color: "hsl(200, 70%, 50%)", colorClass: "bg-blue-500" },
  { key: "oxygen_saturation", label: "SpO₂", unit: "%", color: "hsl(160, 65%, 45%)", colorClass: "bg-emerald-500" },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VitalSignsChartProps {
  data: VitalDataPoint[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VitalSignsChart({ data }: VitalSignsChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(
    new Set(["systolic_bp", "diastolic_bp"])
  )

  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── Canvas drawing ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || data.length < 2) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    const width = rect.width
    const height = 180

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    // ── Layout ──
    const paddingLeft = 44
    const paddingRight = 16
    const paddingTop = 16
    const paddingBottom = 32
    const chartW = width - paddingLeft - paddingRight
    const chartH = height - paddingTop - paddingBottom

    // ── Grid lines ──
    const isDark = document.documentElement.classList.contains("dark")
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + (chartH / 4) * i
      ctx.beginPath()
      ctx.moveTo(paddingLeft, y)
      ctx.lineTo(width - paddingRight, y)
      ctx.stroke()
    }

    // ── X-axis labels ──
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"
    ctx.font = "10px Inter, system-ui, sans-serif"
    ctx.textAlign = "center"
    data.forEach((pt, i) => {
      const x = paddingLeft + (chartW / (data.length - 1)) * i
      ctx.fillText(pt.date, x, height - 8)
    })

    // ── Draw each active metric ──
    const activeList = METRICS.filter((m) => activeMetrics.has(m.key))

    // Pre-calculate BP range across both systolic and diastolic to ensure they share the same scale
    let bpMin = Infinity
    let bpMax = -Infinity
    const hasBP = activeMetrics.has("systolic_bp") || activeMetrics.has("diastolic_bp")
    if (hasBP) {
      data.forEach((pt) => {
        const sys = pt.systolic_bp
        const dia = pt.diastolic_bp
        if (sys !== undefined && sys !== null) {
          if (sys < bpMin) bpMin = sys
          if (sys > bpMax) bpMax = sys
        }
        if (dia !== undefined && dia !== null) {
          if (dia < bpMin) bpMin = dia
          if (dia > bpMax) bpMax = dia
        }
      })
    }
    const bpRange = bpMax - bpMin || 1
    const bpPadding = bpRange * 0.15
    const bpYMin = bpMin - bpPadding
    const bpYMax = bpMax + bpPadding

    for (const metric of activeList) {
      const values = data.map((pt) => (pt as any)[metric.key] as number | undefined)
      const validPairs: [number, number][] = []

      values.forEach((v, i) => {
        if (v !== undefined && v !== null) validPairs.push([i, v])
      })
      if (validPairs.length < 2) continue

      // Auto-scale Y
      let yMin: number
      let yMax: number

      if ((metric.key === "systolic_bp" || metric.key === "diastolic_bp") && bpMin !== Infinity) {
        yMin = bpYMin
        yMax = bpYMax
      } else {
        const allVals = validPairs.map(([, v]) => v)
        const minVal = Math.min(...allVals)
        const maxVal = Math.max(...allVals)
        const range = maxVal - minVal || 1
        const padding = range * 0.15 // 15% vertical padding
        yMin = minVal - padding
        yMax = maxVal + padding
      }

      const toX = (idx: number) => paddingLeft + (chartW / (data.length - 1)) * idx
      const toY = (val: number) => paddingTop + chartH - ((val - yMin) / (yMax - yMin)) * chartH

      // Line
      ctx.strokeStyle = metric.color
      ctx.lineWidth = 2
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      ctx.beginPath()
      validPairs.forEach(([idx, val], i) => {
        const x = toX(idx)
        const y = toY(val)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Area fill (subtle gradient)
      const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartH)
      gradient.addColorStop(0, metric.color.replace(")", ", 0.15)").replace("hsl", "hsla"))
      gradient.addColorStop(1, metric.color.replace(")", ", 0)").replace("hsl", "hsla"))
      ctx.fillStyle = gradient
      ctx.beginPath()
      validPairs.forEach(([idx, val], i) => {
        const x = toX(idx)
        const y = toY(val)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      // Close the area
      const lastX = toX(validPairs[validPairs.length - 1][0])
      const firstX = toX(validPairs[0][0])
      ctx.lineTo(lastX, paddingTop + chartH)
      ctx.lineTo(firstX, paddingTop + chartH)
      ctx.closePath()
      ctx.fill()

      // Dots
      ctx.fillStyle = metric.color
      for (const [idx, val] of validPairs) {
        ctx.beginPath()
        ctx.arc(toX(idx), toY(val), 3.5, 0, Math.PI * 2)
        ctx.fill()
      }

      // Value labels on dots
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)"
      ctx.font = "9px Inter, system-ui, sans-serif"
      ctx.textAlign = "center"
      for (const [idx, val] of validPairs) {
        ctx.fillText(
          metric.key === "temperature" ? val.toFixed(1) : String(Math.round(val)),
          toX(idx),
          toY(val) - 8
        )
      }
    }

    // ── Y-axis label ──
    ctx.save()
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"
    ctx.font = "9px Inter, system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.translate(10, paddingTop + chartH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText("Nilai", 0, 0)
    ctx.restore()
  }, [data, activeMetrics])

  // Redraw on data, metrics, or resize
  useEffect(() => {
    draw()
    const observer = new ResizeObserver(draw)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [draw])

  if (data.length < 2) {
    return (
      <div className="text-xs text-foreground/40 text-center py-3">
        Data vital belum cukup untuk menampilkan grafik tren (minimal 2 kunjungan).
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Metric toggle buttons */}
      <div className="flex flex-wrap gap-1.5">
        {METRICS.map((m) => {
          const isActive = activeMetrics.has(m.key)
          // Check if metric has any data
          const hasData = data.some((pt) => (pt as any)[m.key] !== undefined && (pt as any)[m.key] !== null)
          if (!hasData) return null

          return (
            <button
              key={m.key}
              type="button"
              onClick={() => toggleMetric(m.key)}
              className={`
                inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium
                transition-all duration-200 border
                ${isActive
                  ? "text-white border-transparent shadow-sm"
                  : "bg-transparent text-foreground/50 border-foreground/15 hover:border-foreground/30"
                }
              `}
              style={isActive ? { backgroundColor: m.color } : undefined}
            >
              <span
                className={`w-2 h-2 rounded-full ${isActive ? "bg-white/80" : ""}`}
                style={!isActive ? { backgroundColor: m.color, opacity: 0.4 } : undefined}
              />
              {m.label}
              <span className="opacity-60">{m.unit}</span>
            </button>
          )
        })}
      </div>

      {/* Canvas chart */}
      <div ref={containerRef} className="w-full">
        <canvas ref={canvasRef} className="w-full" />
      </div>
    </div>
  )
}
