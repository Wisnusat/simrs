/**
 * components/shared/stat-card.tsx
 * Reusable KPI stat card. Used across all role dashboards.
 */
import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  colorClass?: string   // e.g. "text-green-600"
  bgClass?: string      // e.g. "bg-green-50 dark:bg-green-950"
}

export function StatCard({ label, value, icon: Icon, colorClass = "text-blue-600", bgClass }: StatCardProps) {
  return (
    <Card>
      <CardContent className={cn("p-6", bgClass)}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground/60">{label}</p>
            <p className={cn("text-2xl font-bold mt-1", colorClass)}>{value}</p>
          </div>
          <Icon className={cn("w-8 h-8", colorClass)} />
        </div>
      </CardContent>
    </Card>
  )
}
