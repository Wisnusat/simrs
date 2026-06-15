import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await rateLimit(req, 'running-bills:delete', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const allowed = ['nurse', 'doctor', 'admin']
  if (!allowed.includes(practitioner.role)) return apiResponse.forbidden('Akses ditolak')

  const { id } = await params

  const { error } = await supabase
    .from('running_bills')
    .delete()
    .eq('id', id)

  if (error) return apiResponse.internalError(error.message)
  return apiResponse.ok({ id })
}
