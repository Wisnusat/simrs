import { nutritionOrderIdentifierSystem } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

const SNOMED = 'http://snomed.info/sct'

export interface NutritionOrderInput {
  localId: string
  orgId: string
  isActive: boolean
  patientIhs: string
  patientName: string
  nutritionistIhs: string
  nutritionistName: string
  ssEncounterId: string | null
  orderDate: string
  dietaryRestrictions: string | null
  energyKcal: number | null
  proteinG: number | null
  notes: string | null
}

export function buildNutritionOrder(i: NutritionOrderInput): object {
  const nutrients: object[] = []
  if (i.energyKcal != null) {
    nutrients.push({
      modifier: { coding: [{ system: SNOMED, code: '33464007', display: 'Energy' }] },
      amount: { value: i.energyKcal, unit: 'kcal', system: 'http://unitsofmeasure.org', code: 'kcal' },
    })
  }
  if (i.proteinG != null) {
    nutrients.push({
      modifier: { coding: [{ system: SNOMED, code: '88878007', display: 'Protein' }] },
      amount: { value: Number(i.proteinG), unit: 'g', system: 'http://unitsofmeasure.org', code: 'g' },
    })
  }

  const oralDiet: Record<string, unknown> = {}
  if (i.dietaryRestrictions) oralDiet.type = [{ text: i.dietaryRestrictions }]
  if (nutrients.length) oralDiet.nutrient = nutrients
  if (i.notes) oralDiet.instruction = i.notes

  return {
    resourceType: 'NutritionOrder',
    identifier: [{ system: nutritionOrderIdentifierSystem(i.orgId), value: i.localId }],
    status: i.isActive ? 'active' : 'cancelled',
    intent: 'order',
    patient: patientRef(i.patientIhs, i.patientName),
    ...(i.ssEncounterId ? { encounter: encounterRef(i.ssEncounterId) } : {}),
    dateTime: i.orderDate,
    orderer: practitionerRef(i.nutritionistIhs, i.nutritionistName),
    ...(Object.keys(oralDiet).length ? { oralDiet } : {}),
  }
}
