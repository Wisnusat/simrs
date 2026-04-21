/**
 * components/shared/page-header.tsx
 * Standard page title + description + refresh button pattern.
 */
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PageHeaderProps {
  title: string
  description?: string
  onRefresh?: () => void
  isRefreshing?: boolean
  children?: React.ReactNode
}

export function PageHeader({ title, description, onRefresh, isRefreshing, children }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        {description && <p className="text-foreground/60 mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}
      </div>
    </div>
  )
}
