/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useCallback } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  LayoutDashboard, BedDouble, UtensilsCrossed, AlertTriangle,
  ArrowLeft, ShieldAlert, Apple, Loader2, Calendar,
} from "lucide-react"

import { useAdmissions } from "@/hooks/inpatient/use-admissions"
import { useAllergies } from "@/hooks/inpatient/use-allergies"
import { useNutritionOrders } from "@/hooks/inpatient/use-nutrition-orders"

import { InpatientPatientList } from "@/components/inpatient/patient-list"
import { NutritionOrderForm } from "@/components/nutritionist/nutrition-order-form"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"

import type { InpatientAdmission, AllergyIntolerance, NutritionOrder } from "@/lib/types/outpatient"

const SIDEBAR = (active: string, set: (v: string) => void) => [
  { icon: LayoutDashboard, label: "Dashboard",        active: active === "dashboard", onClick: () => set("dashboard") },
  { icon: BedDouble,       label: "Pasien",           active: active === "patients",  onClick: () => set("patients") },
]

export default function NutritionistDashboard() {
  const [view, setView] = useState("dashboard")
  const [selectedAdm, setSelectedAdm] = useState<InpatientAdmission | null>(null)

  const { data: admissions, loading: admLoading, refresh: refreshAdm, stats } = useAdmissions()

  // Allergies & nutrition for selected patient
  const { data: allergies, loading: alLoading } = useAllergies(selectedAdm?.patient_id ?? null)
  const { data: nutritionOrders, activeOrder, loading: noLoading, actionLoading: noActing, error: noError, create: createNutrition, update: updateNutrition } = useNutritionOrders(selectedAdm?.episode_of_care_id ?? null)

  const handleSelectPatient = (adm: InpatientAdmission) => {
    setSelectedAdm(adm)
    setView("detail")
  }

  const handleNutritionSubmit = useCallback(async (input: any) => {
    if (activeOrder) {
      return updateNutrition(activeOrder.id, input)
    }
    return createNutrition(input)
  }, [activeOrder, createNutrition, updateNutrition])

  const daysSince = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))

  return (
    <DashboardLayout title="Nutrisi & Gizi" role="nutritionist" sidebarItems={SIDEBAR(view, setView)}>
      {/* ── DASHBOARD ── */}
      {view === "dashboard" && (
        <div className="space-y-6">
          <PageHeader
            title="Dashboard Ahli Gizi"
            description="Kelola nutrisi dan alergi pasien rawat inap"
            onRefresh={refreshAdm}
            isRefreshing={admLoading}
          />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Total Pasien"       value={stats.total}    icon={BedDouble}        colorClass="text-blue-600" />
            <StatCard label="Dalam Perawatan"    value={stats.inCare}   icon={UtensilsCrossed}  colorClass="text-green-600" />
            <StatCard label="Siap Pulang"        value={stats.dischargeReady} icon={AlertTriangle} colorClass="text-orange-600" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Pasien Aktif</CardTitle>
              <CardDescription>Klik untuk melihat detail nutrisi</CardDescription>
            </CardHeader>
            <CardContent>
              <InpatientPatientList
                admissions={admissions.slice(0, 6)}
                loading={admLoading}
                onSelect={handleSelectPatient}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PATIENT LIST ── */}
      {view === "patients" && (
        <div className="space-y-6">
          <PageHeader
            title="Pasien Rawat Inap"
            description="Pilih pasien untuk kelola nutrisi"
            onRefresh={refreshAdm}
            isRefreshing={admLoading}
          />
          <InpatientPatientList
            admissions={admissions}
            loading={admLoading}
            onSelect={handleSelectPatient}
          />
        </div>
      )}

      {/* ── PATIENT DETAIL ── */}
      {view === "detail" && selectedAdm && (
        <div className="space-y-6 max-w-4xl">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedAdm(null); setView("patients") }}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{selectedAdm.patients.full_name}</h2>
              <p className="text-sm text-foreground/60">
                MR: {selectedAdm.patients.medical_record_no} · {selectedAdm.locations?.name} · Bed {selectedAdm.bed_number}
                · Hari ke-{daysSince(selectedAdm.admission_date) + 1}
              </p>
              {selectedAdm.episodes_of_care?.diagnosis_primary && (
                <p className="text-xs text-foreground/40 mt-0.5">Dx: {selectedAdm.episodes_of_care.diagnosis_primary}</p>
              )}
            </div>
            <StatusBadge status={selectedAdm.status} />
          </div>

          {/* ── ALLERGIES (read-only reference for diet planning) ── */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-500" /> Alergi Pasien
                </CardTitle>
                <CardDescription>
                  Data alergi dikaji oleh perawat. Digunakan sebagai referensi penyusunan diet.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {alLoading ? (
                <p className="text-sm text-foreground/50">Memuat...</p>
              ) : allergies.length === 0 ? (
                <p className="text-sm text-foreground/50 py-3 text-center">Tidak ada alergi tercatat.</p>
              ) : (
                <div className="space-y-2">
                  {allergies.map((al) => (
                    <div key={al.id} className="flex items-center justify-between p-3 rounded-lg border bg-red-50/50 dark:bg-red-950/10">
                      <div>
                        <p className="font-medium text-sm">{al.substance_display}</p>
                        <p className="text-xs text-foreground/50">
                          {al.category === "medication" ? "Obat" : al.category === "food" ? "Makanan" : "Lingkungan"}
                          {al.reaction_description ? ` — ${al.reaction_description}` : ""}
                        </p>
                      </div>
                      <Badge
                        variant={al.criticality === "high" ? "destructive" : "outline"}
                        className="text-xs"
                      >
                        {al.criticality === "high" ? "Tinggi" : al.criticality === "low" ? "Rendah" : "N/A"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── NUTRITION ORDER ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Apple className="w-5 h-5 text-green-500" /> Rencana Nutrisi
              </CardTitle>
              <CardDescription>
                {activeOrder
                  ? `Order aktif dari ${new Date(activeOrder.order_date).toLocaleDateString("id-ID")}`
                  : "Belum ada order nutrisi — buat baru di bawah"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Show existing order detail */}
              {activeOrder && (
                <div className="mb-4 p-4 rounded-lg border bg-green-50/50 dark:bg-green-950/10 space-y-2">
                  <div className="flex items-center gap-4 text-sm">
                    <Badge variant="outline">{activeOrder.nutritional_status?.toUpperCase() ?? "—"}</Badge>
                    {activeOrder.energy_needs_kcal && <span>Energi: {activeOrder.energy_needs_kcal} kkal</span>}
                    {activeOrder.protein_needs_g && <span>Protein: {activeOrder.protein_needs_g} g</span>}
                  </div>
                  {activeOrder.dietary_restrictions && (
                    <p className="text-sm text-foreground/60">Restriksi: {activeOrder.dietary_restrictions}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(activeOrder.meal_plan ?? {}).map(([meal, desc]) => (
                      <div key={meal} className="p-2 rounded bg-background border">
                        <span className="font-medium capitalize">{meal}: </span>
                        <span className="text-foreground/70">{desc || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator className="my-4" />

              <NutritionOrderForm
                episodeOfCareId={selectedAdm.episode_of_care_id}
                patientId={selectedAdm.patient_id}
                onSubmit={handleNutritionSubmit}
                loading={noActing}
                error={noError}
                initialData={activeOrder ? {
                  nutritional_status: activeOrder.nutritional_status ?? undefined,
                  dietary_restrictions: activeOrder.dietary_restrictions ?? undefined,
                  energy_needs_kcal: activeOrder.energy_needs_kcal ?? undefined,
                  protein_needs_g: activeOrder.protein_needs_g ?? undefined,
                  meal_plan: activeOrder.meal_plan ?? undefined,
                  notes: activeOrder.notes ?? undefined,
                } : undefined}
              />
            </CardContent>
          </Card>
        </div>
      )}

    </DashboardLayout>
  )
}
