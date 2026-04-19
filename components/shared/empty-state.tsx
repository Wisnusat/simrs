/**
 * components/shared/empty-state.tsx
 * Consistent empty list placeholder.
 */
import type { LucideIcon } from "lucide-react"
import { InboxIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  message?: string
  icon?: LucideIcon
  className?: string
}

export function EmptyState({
  message = "Tidak ada data ditemukan.",
  icon: Icon = InboxIcon,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-foreground/40", className)}>
      <Icon className="w-10 h-10 mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
