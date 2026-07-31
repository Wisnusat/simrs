import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { realFhirClient } from '@/lib/satusehat/client'
import { drainQueue } from '@/lib/satusehat/worker'
import { apiResponse } from '@/lib/api/response'

export const maxDuration = 60 // Vercel function limit for the drain batch

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function run(req: NextRequest) {
  if (!process.env.SATUSEHAT_CLIENT_ID || !process.env.SATUSEHAT_CLIENT_SECRET) {
    return apiResponse.ok({ disabled: true, message: 'SatuSehat credentials not configured' })
  }
  if (!authorized(req)) return apiResponse.unauthorized()
  const supabase = createAdminClient()
  try {
    const stats = await drainQueue(supabase, realFhirClient)
    return apiResponse.ok(stats)
  } catch (e: any) {
    console.error('ss worker drain error:', e)
    return apiResponse.serverError(e?.message)
  }
}

export async function GET(req: NextRequest) { return run(req) }   // Vercel cron uses GET
export async function POST(req: NextRequest) { return run(req) }  // kickWorker uses POST
