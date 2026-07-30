import { createClient } from '@supabase/supabase-js'
import { realFhirClient } from '../lib/satusehat/client'
import { ensurePractitionerIhs } from '../lib/satusehat/practitioner-service'

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: pracs } = await supabase
    .from('practitioners').select('id, full_name').is('ss_ihs_number', null).eq('is_active', true)
  for (const p of pracs ?? []) {
    try {
      const ihs = await ensurePractitionerIhs(supabase, realFhirClient, p.id)
      console.log(`OK   ${p.full_name} → ${ihs}`)
    } catch (e: any) {
      console.log(`SKIP ${p.full_name}: ${e.message}`)
    }
  }
}
main()
