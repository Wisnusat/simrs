import { describe, it, expect } from 'vitest'
import { SS_AUTH_URL, SS_FHIR_URL, FHIR, encounterIdentifierSystem } from '@/lib/satusehat/config'
import { buildPatientPayload } from '@/lib/satusehat/patient-service'
import { buildEncounter } from '@/lib/satusehat/builders/encounter'
import { buildVitalObservations } from '@/lib/satusehat/builders/observation'
import { buildCondition } from '@/lib/satusehat/builders/condition'
import { buildAllergy } from '@/lib/satusehat/builders/allergy'
import { buildClinicalImpression } from '@/lib/satusehat/builders/clinical-note'
import { buildMedication, buildMedicationRequest, buildMedicationDispense } from '@/lib/satusehat/builders/medication'

describe('satusehat config', () => {
  it('builds staging URLs', () => {
    expect(SS_AUTH_URL).toBe('https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken?grant_type=client_credentials')
    expect(SS_FHIR_URL).toBe('https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1')
  })
  it('exposes FHIR code systems', () => {
    expect(FHIR.nik).toBe('https://fhir.kemkes.go.id/id/nik')
    expect(FHIR.icd10).toBe('http://hl7.org/fhir/sid/icd-10')
    expect(encounterIdentifierSystem('100012345')).toBe('http://sys-ids.kemkes.go.id/encounter/100012345')
  })
})

describe('buildPatientPayload', () => {
  const base = {
    id: 'uuid-1', nik: '3174012345678901', full_name: 'Budi Santoso',
    gender: 'male' as const, date_of_birth: '1990-05-17',
    address: 'Jl. Melati 1', city: 'Jakarta', postal_code: '12420', phone: '081234567890',
  }
  it('builds a FHIR Patient with NIK identifier', () => {
    const p: any = buildPatientPayload(base)
    expect(p.resourceType).toBe('Patient')
    expect(p.identifier[0]).toEqual({ use: 'official', system: 'https://fhir.kemkes.go.id/id/nik', value: '3174012345678901' })
    expect(p.name[0].text).toBe('Budi Santoso')
    expect(p.gender).toBe('male')
    expect(p.birthDate).toBe('1990-05-17')
    expect(p.address[0].city).toBe('Jakarta')
    expect(p.telecom[0].value).toBe('081234567890')
  })
  it('omits empty address/telecom', () => {
    const p: any = buildPatientPayload({ ...base, address: null, city: null, postal_code: null, phone: null })
    expect(p.address).toBeUndefined()
    expect(p.telecom).toBeUndefined()
  })
})

describe('buildEncounter', () => {
  const input = {
    localId: 'enc-uuid-1', orgId: '100012345',
    encClass: 'outpatient' as const, status: 'finished' as const,
    patientIhs: 'P0001', patientName: 'Budi Santoso',
    practitionerIhs: 'N10000001', practitionerName: 'dr. Ani',
    ssLocationId: 'loc-ss-1', locationName: 'Poli Umum',
    arrivedAt: '2026-07-01T08:00:00+07:00',
    startedAt: '2026-07-01T08:30:00+07:00',
    finishedAt: '2026-07-01T09:00:00+07:00',
  }
  it('maps class, refs, identifier system', () => {
    const e: any = buildEncounter(input)
    expect(e.resourceType).toBe('Encounter')
    expect(e.class.code).toBe('AMB')
    expect(e.status).toBe('finished')
    expect(e.identifier[0].system).toBe('http://sys-ids.kemkes.go.id/encounter/100012345')
    expect(e.identifier[0].value).toBe('enc-uuid-1')
    expect(e.subject.reference).toBe('Patient/P0001')
    expect(e.participant[0].individual.reference).toBe('Practitioner/N10000001')
    expect(e.location[0].location.reference).toBe('Location/loc-ss-1')
    expect(e.serviceProvider.reference).toBe('Organization/100012345')
  })
  it('builds full statusHistory from timestamps', () => {
    const e: any = buildEncounter(input)
    expect(e.statusHistory).toEqual([
      { status: 'arrived', period: { start: '2026-07-01T08:00:00+07:00', end: '2026-07-01T08:30:00+07:00' } },
      { status: 'in-progress', period: { start: '2026-07-01T08:30:00+07:00', end: '2026-07-01T09:00:00+07:00' } },
      { status: 'finished', period: { start: '2026-07-01T09:00:00+07:00' } },
    ])
    expect(e.period).toEqual({ start: '2026-07-01T08:00:00+07:00', end: '2026-07-01T09:00:00+07:00' })
  })
  it('maps inpatient → IMP and emergency → EMER', () => {
    expect((buildEncounter({ ...input, encClass: 'inpatient' }) as any).class.code).toBe('IMP')
    expect((buildEncounter({ ...input, encClass: 'emergency' }) as any).class.code).toBe('EMER')
  })
})

describe('buildVitalObservations', () => {
  const ctx = { patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1' }
  it('emits one Observation per non-null vital with LOINC + UCUM', () => {
    const obs = buildVitalObservations({
      id: 'vs-1', recorded_at: '2026-07-01T08:15:00+07:00',
      systolic_bp: 120, diastolic_bp: 80, heart_rate: 72, respiratory_rate: null,
      temperature: 36.8, oxygen_saturation: null, weight_kg: null, height_cm: null,
      gcs_score: null, pain_scale: null,
    }, ctx)
    expect(obs.map(o => o.loinc).sort()).toEqual(['8310-5', '8462-4', '8480-6', '8867-4'])
    const sys: any = obs.find(o => o.loinc === '8480-6')!.payload
    expect(sys.code.coding[0]).toEqual({ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' })
    expect(sys.valueQuantity).toEqual({ value: 120, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' })
    expect(sys.encounter.reference).toBe('Encounter/enc-ss-1')
    expect(sys.category[0].coding[0].code).toBe('vital-signs')
    expect(sys.effectiveDateTime).toBe('2026-07-01T08:15:00+07:00')
  })
  it('returns empty array when all vitals null', () => {
    expect(buildVitalObservations({
      id: 'vs-2', recorded_at: '2026-07-01T08:15:00+07:00',
      systolic_bp: null, diastolic_bp: null, heart_rate: null, respiratory_rate: null,
      temperature: null, oxygen_saturation: null, weight_kg: null, height_cm: null,
      gcs_score: null, pain_scale: null,
    }, ctx)).toEqual([])
  })
})

describe('buildCondition', () => {
  it('maps ICD-10 with encounter-diagnosis category', () => {
    const c: any = buildCondition({
      icd10Code: 'A09', icd10Display: 'Diare dan gastroenteritis', clinicalStatus: 'active',
      onsetDate: '2026-07-01', patientIhs: 'P0001', patientName: 'Budi', ssEncounterId: 'enc-ss-1',
    })
    expect(c.resourceType).toBe('Condition')
    expect(c.code.coding[0]).toEqual({ system: 'http://hl7.org/fhir/sid/icd-10', code: 'A09', display: 'Diare dan gastroenteritis' })
    expect(c.category[0].coding[0].code).toBe('encounter-diagnosis')
    expect(c.clinicalStatus.coding[0].code).toBe('active')
    expect(c.subject.reference).toBe('Patient/P0001')
    expect(c.encounter.reference).toBe('Encounter/enc-ss-1')
    expect(c.onsetDateTime).toBe('2026-07-01')
  })
})

describe('buildAllergy', () => {
  it('maps category, criticality, free-text substance and reaction', () => {
    const a: any = buildAllergy({
      substanceDisplay: 'Amoxicillin', category: 'medication', criticality: 'high',
      reactionDescription: 'Ruam kulit', onsetDate: '2020-01-01', isActive: true,
      patientIhs: 'P0001', patientName: 'Budi', ssEncounterId: 'enc-ss-1',
    })
    expect(a.resourceType).toBe('AllergyIntolerance')
    expect(a.clinicalStatus.coding[0].code).toBe('active')
    expect(a.verificationStatus.coding[0].code).toBe('confirmed')
    expect(a.category).toEqual(['medication'])
    expect(a.criticality).toBe('high')
    expect(a.code.text).toBe('Amoxicillin')
    expect(a.reaction[0].manifestation[0].text).toBe('Ruam kulit')
    expect(a.patient.reference).toBe('Patient/P0001')
  })
  it('omits reaction when empty and maps inactive', () => {
    const a: any = buildAllergy({
      substanceDisplay: 'Udang', category: 'food', criticality: 'low',
      reactionDescription: null, onsetDate: null, isActive: false,
      patientIhs: 'P0001', patientName: 'Budi', ssEncounterId: 'enc-ss-1',
    })
    expect(a.clinicalStatus.coding[0].code).toBe('inactive')
    expect(a.reaction).toBeUndefined()
    expect(a.onsetDateTime).toBeUndefined()
  })
})

describe('buildClinicalImpression', () => {
  it('folds SOAP into summary', () => {
    const c: any = buildClinicalImpression({
      subjective: 'Nyeri kepala', objective: 'TD 120/80', assessment: 'Cephalgia', plan: 'Paracetamol',
      noteDate: '2026-07-01T09:00:00+07:00',
      patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1',
    })
    expect(c.resourceType).toBe('ClinicalImpression')
    expect(c.status).toBe('completed')
    expect(c.summary).toBe('S: Nyeri kepala\nO: TD 120/80\nA: Cephalgia\nP: Paracetamol')
    expect(c.assessor.reference).toBe('Practitioner/N1')
    expect(c.date).toBe('2026-07-01T09:00:00+07:00')
  })
  it('skips empty SOAP sections', () => {
    const c: any = buildClinicalImpression({
      subjective: 'Nyeri', objective: null, assessment: null, plan: null,
      noteDate: '2026-07-01T09:00:00+07:00',
      patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1',
    })
    expect(c.summary).toBe('S: Nyeri')
  })
})

describe('pharmacy builders', () => {
  it('buildMedication uses KFA coding', () => {
    const m: any = buildMedication({ localId: 'med-1', orgId: '100012345', kfaCode: '93001019', name: 'Paracetamol 500mg' })
    expect(m.resourceType).toBe('Medication')
    expect(m.code.coding[0]).toEqual({ system: 'http://sys-ids.kemkes.go.id/kfa', code: '93001019', display: 'Paracetamol 500mg' })
    expect(m.identifier[0].system).toBe('http://sys-ids.kemkes.go.id/medication/100012345')
  })
  it('buildMedication falls back to code.text without KFA', () => {
    const m: any = buildMedication({ localId: 'med-2', orgId: '100012345', kfaCode: null, name: 'Racikan X' })
    expect(m.code.coding).toBeUndefined()
    expect(m.code.text).toBe('Racikan X')
  })
  it('buildMedicationRequest references Medication + dosage text', () => {
    const r: any = buildMedicationRequest({
      prescriptionId: 'rx-1', itemId: 'rxi-1', orgId: '100012345',
      ssMedicationId: 'ss-med-1', medicationName: 'Paracetamol 500mg',
      dosage: '500 mg', frequency: '3x1', instructions: 'Sesudah makan',
      authoredOn: '2026-07-01T09:10:00+07:00',
      patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1',
    })
    expect(r.resourceType).toBe('MedicationRequest')
    expect(r.intent).toBe('order')
    expect(r.medicationReference.reference).toBe('Medication/ss-med-1')
    expect(r.dosageInstruction[0].text).toBe('500 mg 3x1')
    expect(r.dosageInstruction[0].patientInstruction).toBe('Sesudah makan')
    expect(r.requester.reference).toBe('Practitioner/N1')
  })
  it('buildMedicationDispense references the authorizing request', () => {
    const d: any = buildMedicationDispense({
      localId: 'disp-1', orgId: '100012345',
      ssMedicationId: 'ss-med-1', medicationName: 'Paracetamol 500mg', ssMedicationRequestId: 'ss-mr-1',
      quantity: 10, whenHandedOver: '2026-07-01T10:00:00+07:00',
      patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'F1', ssEncounterId: 'enc-ss-1',
    })
    expect(d.resourceType).toBe('MedicationDispense')
    expect(d.authorizingPrescription[0].reference).toBe('MedicationRequest/ss-mr-1')
    expect(d.quantity.value).toBe(10)
    expect(d.whenHandedOver).toBe('2026-07-01T10:00:00+07:00')
  })
})
