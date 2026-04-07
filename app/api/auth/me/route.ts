import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
    try {
        const supabase = await createClient()

        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { data: practitioner, error: profileError } = await supabase
            .from('practitioners')
            .select(`
        id,
        full_name,
        role,
        specialization,
        email,
        phone,
        organization_id,
        organizations (
          id,
          name,
          type
        )
      `)
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single()

        if (profileError || !practitioner) {
            return NextResponse.json(
                { success: false, error: 'Profile not found' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            data: {
                id: practitioner.id,
                full_name: practitioner.full_name,
                role: practitioner.role,
                specialization: practitioner.specialization,
                email: practitioner.email,
                phone: practitioner.phone,
                organization: practitioner.organizations,
            },
        })
    } catch {
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}