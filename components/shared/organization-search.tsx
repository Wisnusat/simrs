"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Search, Loader2, Building2, CheckCircle2, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { searchSsOrganizations, type SsOrganization } from "@/lib/api/client"

export interface OrganizationSelection {
  name: string
  ssOrgId: string | null
}

interface Props {
  value: OrganizationSelection
  onChange: (v: OrganizationSelection) => void
  required?: boolean
}

export function OrganizationSearch({ value, onChange, required }: Props) {
  const [query, setQuery] = useState(value.name)
  const [results, setResults] = useState<SsOrganization[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [freeText, setFreeText] = useState(!value.ssOrgId && !!value.name)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value.name)
    setFreeText(!value.ssOrgId && !!value.name)
  }, [value.name, value.ssOrgId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current)
    if (q.length < 3) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchSsOrganizations(q)
        setResults(data)
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
  }, [])

  const handleInput = (q: string) => {
    setQuery(q)
    setFreeText(false)
    onChange({ name: q, ssOrgId: null })
    search(q)
  }

  const select = (org: SsOrganization) => {
    setQuery(org.name)
    setOpen(false)
    setFreeText(false)
    onChange({ name: org.name, ssOrgId: org.id })
  }

  const useFreeText = () => {
    setOpen(false)
    setFreeText(true)
    onChange({ name: query, ssOrgId: null })
  }

  const clear = () => {
    setQuery("")
    setFreeText(false)
    setResults([])
    onChange({ name: "", ssOrgId: null })
  }

  return (
    <div ref={containerRef} className="space-y-1.5">
      <Label>Faskes Tujuan {required && <span className="text-destructive">*</span>}</Label>
      <div className="relative">
        <div className="flex items-center gap-2 border rounded-md px-3 py-2 focus-within:ring-2 focus-within:ring-ring bg-background">
          {freeText
            ? <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            : value.ssOrgId
              ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              : <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          }
          <input
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            placeholder="Cari nama faskes tujuan..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true) }}
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
          {query && !loading && (
            <button type="button" onClick={clear} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {open && (
          <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
            {results.length > 0 ? (
              <ul className="max-h-56 overflow-y-auto divide-y divide-border">
                {results.map((org) => (
                  <li key={org.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors"
                      onClick={() => select(org)}
                    >
                      <p className="text-sm font-medium leading-tight">{org.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[org.type, org.city].filter(Boolean).join(' · ')} · ID: {org.id}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent border-t border-border"
              onClick={useFreeText}
            >
              Tidak ditemukan di SATUSEHAT? Gunakan teks bebas: &ldquo;{query}&rdquo;
            </button>
          </div>
        )}
      </div>

      {value.ssOrgId && (
        <p className="text-xs text-green-600 dark:text-green-400">
          Terverifikasi SATUSEHAT · ID: {value.ssOrgId}
        </p>
      )}
      {freeText && !value.ssOrgId && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Teks bebas — tidak terhubung ke SATUSEHAT Organization
        </p>
      )}
    </div>
  )
}
