"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, AlertTriangle } from "lucide-react"
import type { EmergencyEncounter, TriageCategory } from "@/lib/types/outpatient"
import { useEmergency } from "@/hooks/emergency/use-emergency"

interface EmergencyTriageFormProps {
  encounter: EmergencyEncounter
  onSuccess: () => void
}

export function EmergencyTriageForm({ encounter, onSuccess }: EmergencyTriageFormProps) {
  const [triageCategory, setTriageCategory] = useState<string>(encounter.triage_category || "")
  const [triageComplaint, setTriageComplaint] = useState(encounter.triage_complaint || "")
  const [isCritical, setIsCritical] = useState(encounter.is_critical)
  
  const { update, actionLoading } = useEmergency()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Status should be "in_treatment" once triage is done
    const success = await update(encounter.id, {
      triage_category: triageCategory,
      triage_complaint: triageComplaint,
      is_critical: isCritical,
      status: encounter.status === "emergency_admitted" ? "in_triage" : encounter.status // optionally move to in_triage or keep it
    })
    
    // Auto move to in_treatment? Let's just keep the status update logic simple.
    // The API might align it.
    if (success) {
      onSuccess()
    }
  }

  const getTriageColor = (cat: string) => {
    switch(cat) {
      case "P1": return "text-red-600 bg-red-100 dark:bg-red-900/30 border-red-200"
      case "P2": return "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200"
      case "P3": return "text-green-600 bg-green-100 dark:bg-green-900/30 border-green-200"
      case "P4": return "text-slate-800 bg-slate-200 dark:bg-slate-800 border-slate-300"
      default: return "border-border"
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b">
        <AlertTriangle className="w-5 h-5 text-orange-500" />
        <h3 className="font-semibold text-lg">Asesmen Triage</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Kategori Triage *</Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "P1", label: "P1 (Merah) - Gawat Darurat" },
              { id: "P2", label: "P2 (Kuning) - Darurat Tidak Gawat" },
              { id: "P3", label: "P3 (Hijau) - Tidak Darurat" },
              { id: "P4", label: "P4 (Hitam) - Meninggal / Exiting" }
            ].map(tc => (
              <label 
                key={tc.id}
                className={`flex flex-col p-3 border rounded-lg cursor-pointer transition-all ${
                  triageCategory === tc.id ? "ring-2 ring-blue-500 " + getTriageColor(tc.id) : "hover:bg-muted"
                }`}
              >
                <input 
                  type="radio" 
                  name="triage" 
                  value={tc.id} 
                  checked={triageCategory === tc.id}
                  onChange={() => setTriageCategory(tc.id)}
                  className="sr-only"
                />
                <span className="font-bold">{tc.id}</span>
                <span className="text-xs opacity-80">{tc.label.split(' - ')[1]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Keluhan Utama *</Label>
            <Textarea 
              rows={3}
              value={triageComplaint}
              onChange={(e) => setTriageComplaint(e.target.value)}
              placeholder="Jelaskan keluhan utama pasien saat tiba..."
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label>Penilaian Kondisi</Label>
            <Select 
              value={isCritical ? "true" : "false"} 
              onValueChange={(v) => setIsCritical(v === "true")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Stabil / Tidak Kritis</SelectItem>
                <SelectItem value="true">Gawat Darurat / Kritis</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button 
          type="submit" 
          disabled={actionLoading || !triageCategory || !triageComplaint} 
          className="bg-blue-600 hover:bg-blue-700"
        >
          {actionLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</> : "Simpan Data Triage"}
        </Button>
      </div>
    </form>
  )
}
