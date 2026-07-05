export const patientRef = (ihs: string, name?: string) =>
  ({ reference: `Patient/${ihs}`, ...(name ? { display: name } : {}) })
export const practitionerRef = (ihs: string, name?: string) =>
  ({ reference: `Practitioner/${ihs}`, ...(name ? { display: name } : {}) })
export const orgRef = (orgId: string) => ({ reference: `Organization/${orgId}` })
export const encounterRef = (ssEncounterId: string) => ({ reference: `Encounter/${ssEncounterId}` })
