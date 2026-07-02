import { realFhirClient } from '../lib/satusehat/client'
import { ssConfig, FHIR } from '../lib/satusehat/config'

async function main() {
  const { orgId } = ssConfig()
  console.log('1. Organization lookup…')
  const org = await realFhirClient.get(`/Organization/${orgId}`)
  console.log(`   ${org.status} ${org.body?.resourceType ?? ''} ${org.body?.name ?? JSON.stringify(org.body)}`)

  console.log('2. Patient search by test NIK (sandbox dummy)…')
  // Official sandbox test NIK published in SATUSEHAT docs
  const pat = await realFhirClient.get(`/Patient?identifier=${encodeURIComponent(`${FHIR.nik}|9271060312000001`)}`)
  console.log(`   ${pat.status} total=${pat.body?.total}`)
  if (!org.ok || !pat.ok) process.exit(1)
  console.log('SMOKE OK')
}
main()
