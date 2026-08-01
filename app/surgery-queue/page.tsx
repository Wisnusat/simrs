"use client"

export const dynamic = 'force-dynamic'

import { Badge } from "@/components/ui/badge"
import { useSurgeryRequests } from "@/hooks/outpatient/use-surgery-requests"
import { getLocations } from "@/lib/api/client"
import type { Location } from "@/lib/types/outpatient"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Shield
} from "lucide-react"
import { useEffect, useState } from "react"

export default function SurgeryQueuePublic() {
  const { data: surgeryRequests, loading, refresh } = useSurgeryRequests()
  const [rooms, setRooms] = useState<Location[]>([])

  useEffect(() => {
    getLocations({ type: "ok" }).catch(() => { })
  }, [])

  // EHR/Kemenkes standard name masking for public TV displays
  const maskName = (name: string) => {
    if (!name) return "—"
    const parts = name.split(" ")
    return parts
      .map((part) => {
        if (part.length <= 2) return part
        return part.substring(0, 2) + "*".repeat(Math.min(part.length - 2, 5))
      })
      .join(" ")
  }

  // Group surgeries by status
  const ongoing = surgeryRequests.filter((r) => r.status === "intra_operative")
  const scheduled = surgeryRequests.filter(
    (r) => r.status === "surgery_scheduled" || r.status === "ready_for_surgery"
  )
  const completed = surgeryRequests.filter((r) => r.status === "surgery_completed" || r.status === "post_operative")

  return (
    <div className="min-h-screen bg-[#08090f] text-foreground p-6 md:p-10 font-sans selection:bg-red-500/30">
      {/* Background radial gradients for sci-fi look */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#2e1065_0%,transparent_50%)] pointer-events-none opacity-40" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_80%,#0f172a_0%,transparent_40%)] pointer-events-none opacity-50" />

      <div className="relative max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/10 pb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent">
                MONITOR ANTRIAN KAMAR OPERASI
              </h1>
            </div>
            <p className="text-sm text-slate-400 mt-1 uppercase tracking-widest font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500" /> EHR PRIVACY-PROTECTED DISPLAY · STANDAR SATUSEHAT KEMENKES
            </p>
          </div>
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-4 py-2 rounded-xl backdrop-blur-md">
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold tracking-wider text-slate-300">
              {new Date().toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>
        </header>

        {/* Core content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* COLUMN 1 & 2: ONGOING & UPCOMING */}
          <div className="lg:col-span-2 space-y-8">
            {/* ONGOING SURGERIES */}
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-5 h-5 animate-pulse" /> Sedang Berlangsung (Ongoing)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ongoing.map((item) => (
                  <div
                    key={item.id}
                    className="relative bg-gradient-to-br from-amber-500/10 to-amber-950/20 border border-amber-500/30 rounded-2xl p-5 shadow-[0_0_20px_rgba(245,158,11,0.1)] backdrop-blur-sm overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none" />
                    <div className="flex justify-between items-start">
                      <div>
                        <Badge className="bg-amber-500 text-slate-950 font-extrabold tracking-wider text-[10px] uppercase mb-3 px-2.5 py-0.5 rounded-full animate-pulse">
                          DALAM OPERASI
                        </Badge>
                        <h3 className="text-2xl font-black text-white tracking-wide">
                          {maskName(item.patients?.full_name ?? "")}
                        </h3>
                        <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">
                          {item.surgery_type}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs bg-amber-500/20 text-amber-300 font-mono font-bold px-2 py-1 rounded-md">
                          {item.locations?.name ?? "OK ROOM"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-white/5 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 block uppercase font-semibold text-[9px] tracking-wider">Dokter Bedah</span>
                        <span className="text-slate-300 font-medium">{item.surgeon?.full_name ?? "—"}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block uppercase font-semibold text-[9px] tracking-wider">Mulai Jam</span>
                        <span className="text-amber-400 font-mono font-bold">
                          {item.surgery_start_at ? new Date(item.surgery_start_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {ongoing.length === 0 && (
                  <div className="col-span-2 bg-white/5 border border-white/5 rounded-2xl p-8 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    Tidak ada tindakan operasi yang sedang berlangsung saat ini.
                  </div>
                )}
              </div>
            </section>

            {/* SCHEDULED / UPCOMING */}
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-5 h-5" /> Antrian Jadwal Hari Ini (Scheduled)
              </h2>
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10 text-slate-400 text-xs font-bold uppercase tracking-wider">
                        <th className="p-4 pl-6">Pasien</th>
                        <th className="p-4">Jenis Tindakan</th>
                        <th className="p-4">Ruang Bedah</th>
                        <th className="p-4">Rencana Jam</th>
                        <th className="p-4">Dokter</th>
                        <th className="p-4 pr-6 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm">
                      {scheduled.map((item) => {
                        const schedDate = item.scheduled_date ? new Date(item.scheduled_date) : null
                        const displayTime = schedDate
                          ? schedDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                          : "—"
                        return (
                          <tr key={item.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 pl-6 font-bold text-white">
                              {maskName(item.patients?.full_name ?? "")}
                            </td>
                            <td className="p-4 text-slate-300 font-semibold">{item.surgery_type}</td>
                            <td className="p-4 text-slate-400 font-medium">{item.locations?.name ?? "OK Room"}</td>
                            <td className="p-4 text-blue-400 font-mono font-bold">{displayTime}</td>
                            <td className="p-4 text-slate-400 text-xs">{item.surgeon?.full_name ?? "—"}</td>
                            <td className="p-4 pr-6 text-right">
                              <Badge className={
                                item.status === "ready_for_surgery"
                                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                                  : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                              }>
                                {item.status === "ready_for_surgery" ? "Bersiap (Ready)" : "Terjadwal"}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                      {scheduled.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500">
                            Tidak ada jadwal antrian operasi selanjutnya hari ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>

          {/* COLUMN 3: RECENTLY COMPLETED */}
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> Selesai Hari Ini (Completed)
            </h2>
            <div className="space-y-4">
              {completed.map((item) => (
                <div
                  key={item.id}
                  className="bg-white/5 border border-white/5 rounded-2xl p-4 backdrop-blur-sm hover:border-emerald-500/20 transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-white">{maskName(item.patients?.full_name ?? "")}</h4>
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mt-0.5">
                        {item.surgery_type}
                      </p>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase font-mono font-bold py-0.5">
                      SELESAI
                    </Badge>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 flex justify-between text-[11px] text-slate-400">
                    <span>Ruang: {item.locations?.name ?? "OK Room"}</span>
                    <span>
                      Selesai:{" "}
                      <span className="text-emerald-400 font-mono font-bold">
                        {item.surgery_end_at ? new Date(item.surgery_end_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                    </span>
                  </div>
                </div>
              ))}

              {completed.length === 0 && (
                <div className="bg-white/5 border border-white/5 rounded-2xl p-8 text-center text-slate-600 text-sm">
                  Belum ada tindakan operasi selesai hari ini.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 pt-6 border-t border-white/10 gap-4">
          <p className="flex items-center gap-1">
            <span>Sistem Informasi Manajemen Rumah Sakit (SIMRS)</span>
          </p>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-600" />
            <span>Halaman ini diperbarui otomatis setiap 10 detik</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
