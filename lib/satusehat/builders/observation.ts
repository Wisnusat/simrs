import { FHIR } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

export interface VitalSignsRow {
  id: string; recorded_at: string
  systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null
  respiratory_rate: number | null; temperature: number | null; oxygen_saturation: number | null
  weight_kg: number | null; height_cm: number | null; gcs_score: number | null; pain_scale: number | null
}

export interface ObservationContext {
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}

const VITAL_DEFS: Array<{
  field: keyof VitalSignsRow
  loinc: string; display: string; unit: string; ucum: string
}> = [
  { field: 'systolic_bp',       loinc: '8480-6',  display: 'Systolic blood pressure',  unit: 'mmHg',    ucum: 'mm[Hg]' },
  { field: 'diastolic_bp',      loinc: '8462-4',  display: 'Diastolic blood pressure', unit: 'mmHg',    ucum: 'mm[Hg]' },
  { field: 'heart_rate',        loinc: '8867-4',  display: 'Heart rate',               unit: 'beats/minute', ucum: '/min' },
  { field: 'respiratory_rate',  loinc: '9279-1',  display: 'Respiratory rate',         unit: 'breaths/minute', ucum: '/min' },
  { field: 'temperature',       loinc: '8310-5',  display: 'Body temperature',         unit: 'C',       ucum: 'Cel' },
  { field: 'oxygen_saturation', loinc: '2708-6',  display: 'Oxygen saturation in Arterial blood', unit: '%', ucum: '%' },
  { field: 'weight_kg',         loinc: '29463-7', display: 'Body weight',              unit: 'kg',      ucum: 'kg' },
  { field: 'height_cm',         loinc: '8302-2',  display: 'Body height',              unit: 'cm',      ucum: 'cm' },
  { field: 'gcs_score',         loinc: '9269-2',  display: 'Glasgow coma score total', unit: 'score',   ucum: '{score}' },
  { field: 'pain_scale',        loinc: '72514-3', display: 'Pain severity - 0-10 verbal numeric rating', unit: 'score', ucum: '{score}' },
]

export function buildVitalObservations(row: VitalSignsRow, ctx: ObservationContext) {
  return VITAL_DEFS
    .filter(def => row[def.field] !== null && row[def.field] !== undefined)
    .map(def => ({
      loinc: def.loinc,
      payload: {
        resourceType: 'Observation',
        status: 'final',
        category: [{ coding: [{ system: FHIR.obsCategory, code: 'vital-signs', display: 'Vital Signs' }] }],
        code: { coding: [{ system: FHIR.loinc, code: def.loinc, display: def.display }] },
        subject: patientRef(ctx.patientIhs, ctx.patientName),
        performer: [practitionerRef(ctx.practitionerIhs)],
        encounter: encounterRef(ctx.ssEncounterId),
        effectiveDateTime: row.recorded_at,
        valueQuantity: { value: Number(row[def.field]), unit: def.unit, system: FHIR.ucum, code: def.ucum },
      },
    }))
}
